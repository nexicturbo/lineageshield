#!/usr/bin/env python3
"""Collect read-only DataHub MCP context for LineageShield.

Live mode requires the official MCP Python SDK and httpx:
    python -m pip install "mcp>=1.27,<2" httpx

Authentication is read from DATAHUB_MCP_TOKEN (or DATAHUB_GMS_TOKEN as a
fallback). The token is used only in the Authorization header and is never
written to the output trace.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any, Awaitable, Callable


REQUIRED_TOOLS = (
    "search",
    "get_entities",
    "list_schema_fields",
    "get_lineage",
)

ToolCaller = Callable[[str, dict[str, Any]], Awaitable[Any]]


def normalize_result(result: Any) -> Any:
    """Turn an MCP SDK result (or fixture value) into JSON-compatible data."""
    if hasattr(result, "model_dump"):
        result = result.model_dump(by_alias=True, exclude_none=True)

    if not isinstance(result, dict):
        return result

    structured = result.get("structuredContent")
    if structured is not None:
        return structured

    content = result.get("content")
    if not isinstance(content, list):
        return result

    text_parts = [
        item.get("text")
        for item in content
        if isinstance(item, dict) and isinstance(item.get("text"), str)
    ]
    if len(text_parts) == 1:
        try:
            return json.loads(text_parts[0])
        except json.JSONDecodeError:
            return text_parts[0]
    if text_parts:
        return text_parts
    return result


def first_urn(value: Any) -> str | None:
    """Find the first DataHub URN in a nested MCP response."""
    if isinstance(value, dict):
        urn = value.get("urn")
        if isinstance(urn, str) and urn.startswith("urn:li:"):
            return urn
        for child in value.values():
            found = first_urn(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = first_urn(child)
            if found:
                return found
    return None


def search_expression(query: str) -> str:
    """Convert a human query to DataHub's documented structured search form."""
    query = query.strip()
    if query.startswith("/q "):
        return query
    terms = [term for term in query.split() if term]
    return f"/q {'+'.join(terms)}" if terms else "/q *"


def query_keywords(query: str) -> list[str]:
    cleaned = query.removeprefix("/q ").replace("+", " ")
    return [term.strip() for term in cleaned.split() if term.strip()]


async def collect_context(
    *,
    call_tool: ToolCaller,
    available_tools: set[str],
    query: str,
    target_urn: str | None,
    source: dict[str, Any],
) -> dict[str, Any]:
    missing = sorted(set(REQUIRED_TOOLS) - available_tools)
    if missing:
        raise RuntimeError(
            "DataHub MCP server is missing required read-only tools: "
            + ", ".join(missing)
        )

    trace: list[dict[str, Any]] = []

    async def invoke(name: str, arguments: dict[str, Any]) -> Any:
        result = normalize_result(await call_tool(name, arguments))
        trace.append({"name": name, "arguments": arguments, "result": result})
        return result

    structured_query = search_expression(query)
    search_result = await invoke(
        "search",
        {"query": structured_query, "num_results": 10},
    )
    resolved_urn = target_urn or first_urn(search_result)
    if not resolved_urn:
        raise RuntimeError(
            "Search returned no DataHub URN. Supply --target-urn explicitly."
        )

    entity_result = await invoke("get_entities", {"urns": [resolved_urn]})
    schema_result = await invoke(
        "list_schema_fields",
        {
            "urn": resolved_urn,
            "keywords": query_keywords(structured_query),
            "limit": 100,
            "offset": 0,
        },
    )
    lineage_result = await invoke(
        "get_lineage",
        {
            "urn": resolved_urn,
            "upstream": False,
            "max_hops": 3,
            "max_results": 100,
            "offset": 0,
        },
    )

    return {
        "format": "lineageshield-datahub-mcp-context-v1",
        "source": source,
        "query": structured_query,
        "targetUrn": resolved_urn,
        "toolCalls": trace,
        "context": {
            "search": search_result,
            "entity": entity_result,
            "schema": schema_result,
            "downstreamLineage": lineage_result,
        },
    }


async def collect_from_fixture(
    fixture_path: Path,
    query: str,
    target_urn: str | None,
) -> dict[str, Any]:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    available_tools = set(fixture.get("tools", []))
    responses = fixture.get("responses", {})

    async def call_tool(name: str, arguments: dict[str, Any]) -> Any:
        del arguments
        if name not in responses:
            raise RuntimeError(f"Fixture has no response for {name}.")
        return responses[name]

    return await collect_context(
        call_tool=call_tool,
        available_tools=available_tools,
        query=query,
        target_urn=target_urn,
        source={
            "transport": "fixture",
            "fixture": fixture_path.as_posix(),
            "server": fixture.get("server", "fixture://datahub-mcp"),
        },
    )


async def collect_from_server(
    url: str,
    token: str,
    query: str,
    target_urn: str | None,
) -> dict[str, Any]:
    try:
        import httpx
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client
    except ImportError as exc:
        raise RuntimeError(
            'Live mode requires: python -m pip install "mcp>=1.27,<2" httpx'
        ) from exc

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(
        headers=headers,
        follow_redirects=True,
        timeout=60,
    ) as http_client:
        async with streamable_http_client(
            url,
            http_client=http_client,
        ) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                listed = await session.list_tools()
                available_tools = {tool.name for tool in listed.tools}

                async def call_tool(name: str, arguments: dict[str, Any]) -> Any:
                    return await session.call_tool(name, arguments)

                return await collect_context(
                    call_tool=call_tool,
                    available_tools=available_tools,
                    query=query,
                    target_urn=target_urn,
                    source={
                        "transport": "streamable-http",
                        "server": url,
                    },
                )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Use DataHub MCP to collect entity, schema, ownership, and "
            "downstream-lineage context for LineageShield."
        )
    )
    parser.add_argument(
        "--url",
        default=os.getenv("DATAHUB_MCP_URL"),
        help="DataHub MCP endpoint, e.g. https://tenant.acryl.io/integrations/ai/mcp/",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("DATAHUB_MCP_TOKEN")
        or os.getenv("DATAHUB_GMS_TOKEN"),
        help="Personal Access Token (prefer DATAHUB_MCP_TOKEN).",
    )
    parser.add_argument(
        "--query",
        default="customer email",
        help="Human-readable or /q-prefixed DataHub search query.",
    )
    parser.add_argument(
        "--target-urn",
        help="Optional explicit dataset URN; otherwise the first search result is used.",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        help="Use a deterministic MCP response fixture instead of a live server.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("examples/mcp/lineageshield-mcp-context.json"),
    )
    return parser.parse_args()


async def async_main() -> None:
    args = parse_args()
    if args.fixture:
        context = await collect_from_fixture(
            args.fixture,
            args.query,
            args.target_urn,
        )
    else:
        if not args.url or not args.token:
            raise SystemExit(
                "Provide --url/--token or DATAHUB_MCP_URL/DATAHUB_MCP_TOKEN."
            )
        context = await collect_from_server(
            args.url,
            args.token,
            args.query,
            args.target_urn,
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(context, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Recorded {len(context['toolCalls'])} DataHub MCP calls in {args.output}"
    )


if __name__ == "__main__":
    asyncio.run(async_main())
