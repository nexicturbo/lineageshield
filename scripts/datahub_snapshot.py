#!/usr/bin/env python3
"""Export a read-only DataHub metadata snapshot for LineageShield.

Requires: pip install acryl-datahub
Authentication is read from arguments or DATAHUB_GMS_URL / DATAHUB_GMS_TOKEN.
The token is never written to disk.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from datahub.ingestion.graph.client import DataHubGraph, DatahubClientConfig


ASPECTS = [
    "datasetProperties",
    "dashboardInfo",
    "chartInfo",
    "mlModelProperties",
    "ownership",
    "globalTags",
    "schemaMetadata",
    "upstreamLineage",
]


def unwrap(value: Any) -> Any:
    """Remove REST aspect wrappers without depending on one server version."""
    while isinstance(value, dict) and set(value).issubset(
        {"value", "type", "contentType", "created"}
    ):
        if "value" not in value:
            break
        value = value["value"]
    return value


def aspect(raw: dict[str, Any], name: str) -> dict[str, Any]:
    aspects = raw.get("aspects", raw)
    value = unwrap(aspects.get(name, {}))
    return value if isinstance(value, dict) else {}


def owner_name(item: dict[str, Any]) -> str:
    owner = item.get("owner", "")
    if isinstance(owner, str):
        return owner.rsplit(":", 1)[-1].replace("_", " ").title()
    return "Unassigned"


def normalize(graph: DataHubGraph, entity_urn: str) -> dict[str, Any]:
    raw = graph.get_entity_raw(entity_urn, aspects=ASPECTS)
    properties = (
        aspect(raw, "datasetProperties")
        or aspect(raw, "dashboardInfo")
        or aspect(raw, "chartInfo")
        or aspect(raw, "mlModelProperties")
    )
    ownership = aspect(raw, "ownership").get("owners", [])
    tags = aspect(raw, "globalTags").get("tags", [])
    schema = aspect(raw, "schemaMetadata")
    lineage = aspect(raw, "upstreamLineage").get("upstreams", [])

    name = (
        properties.get("name")
        or properties.get("title")
        or entity_urn.split(",")[-2].rsplit(":", 1)[-1]
    )
    description = properties.get("description") or "DataHub asset"
    fields = [
        field.get("fieldPath", "")
        for field in schema.get("fields", [])
        if field.get("fieldPath")
    ]
    owner = owner_name(ownership[0]) if ownership else "Unassigned"
    tag_names = [
        item.get("tag", "")
        .rsplit(":", 1)[-1]
        .replace("%20", " ")
        for item in tags
        if item.get("tag")
    ]
    upstreams = [
        item.get("dataset")
        for item in lineage
        if isinstance(item, dict) and item.get("dataset")
    ]

    entity_type = entity_urn.split(":", 3)[2] if entity_urn.startswith("urn:li:") else "dataset"
    type_map = {
        "dataset": "dataset",
        "dashboard": "dashboard",
        "chart": "dashboard",
        "mlModel": "mlModel",
    }

    return {
        "urn": entity_urn,
        "name": name,
        "subtitle": description[:120],
        "type": type_map.get(entity_type, "dataset"),
        "platform": properties.get("platform", "DataHub"),
        "owner": owner,
        "tier": 1 if "Tier1" in tag_names else 2 if "Tier2" in tag_names else 3,
        "tags": tag_names,
        "fields": fields,
        "upstreamUrns": upstreams,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export DataHub lineage and governance context for LineageShield."
    )
    parser.add_argument(
        "--server",
        default=os.getenv("DATAHUB_GMS_URL"),
        help="DataHub GMS URL, e.g. https://tenant.acryl.io/gms",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("DATAHUB_GMS_TOKEN"),
        help="Personal Access Token (prefer DATAHUB_GMS_TOKEN)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/datahub-snapshot.json"),
    )
    parser.add_argument("--limit", type=int, default=500)
    args = parser.parse_args()

    if not args.server or not args.token:
        parser.error("Provide --server/--token or DATAHUB_GMS_URL/DATAHUB_GMS_TOKEN.")

    graph = DataHubGraph(
        DatahubClientConfig(server=args.server, token=args.token)
    )
    try:
        urns = graph.get_urns_by_filter(
            entity_types=["dataset", "dashboard", "chart", "mlModel"],
            query="*",
        )
        assets = []
        errors = []
        for index, entity_urn in enumerate(urns):
            if index >= args.limit:
                break
            try:
                assets.append(normalize(graph, entity_urn))
            except Exception as exc:  # keep a partial, auditable export
                errors.append({"urn": entity_urn, "error": str(exc)})
    finally:
        graph.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "format": "lineageshield-datahub-snapshot-v1",
                "assets": assets,
                "errors": errors,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Exported {len(assets)} assets to {args.output}")
    if errors:
        print(f"Skipped {len(errors)} assets; details are recorded in the snapshot.")


if __name__ == "__main__":
    main()
