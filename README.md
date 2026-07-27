# LineageShield

**Every downstream consequence, before merge.**

LineageShield is a context-graph agent that turns a proposed schema change into:

- a complete downstream blast radius;
- a risk-ranked map of affected datasets, dashboards, ML models, and activations;
- the exact owners who must approve the change;
- a phased, merge-ready rollout plan; and
- compatibility SQL tailored to the proposed change.

The agent grounds every recommendation in DataHub lineage, ownership, tags, tiers, and schema metadata. The hosted demo ships with a representative DataHub snapshot so it is immediately testable; the included exporter connects the same engine to any DataHub Cloud or Core instance.

## Why it exists

A schema diff rarely explains its real impact. The dangerous consequences live in the metadata graph: a field feeds an executive dashboard three hops away, a production model depends on its historical semantics, or a PII transformation silently changes an activation audience.

LineageShield traces those consequences before merge and converts them into actions rather than another catalog page.

## Try it

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`, choose one of the proposed changes, and select **Analyze change**.

The demo includes three reproducible scenarios:

1. hashing plaintext customer email;
2. narrowing a revenue field's decimal type; and
3. renaming an online ML feature.

Each scenario runs the real traversal, risk, ownership, rollout, and guardrail logic in `lib/lineage.ts`.

## Connect DataHub

Install the official SDK:

```bash
python -m pip install acryl-datahub
```

Export a read-only snapshot:

```bash
export DATAHUB_GMS_URL="https://your-tenant.acryl.io/gms"
export DATAHUB_GMS_TOKEN="your-personal-access-token"
python scripts/datahub_snapshot.py --output data/datahub-snapshot.json
```

The exporter:

- discovers datasets, dashboards, charts, and ML models with DataHub's graph client;
- reads `datasetProperties`, dashboard/model properties, ownership, global tags, schema metadata, and upstream lineage;
- normalizes those aspects into LineageShield's small, auditable snapshot format;
- records partial-export errors instead of hiding them; and
- never writes the DataHub access token to disk.

The script is intentionally read-only. It uses `get_urns_by_filter` and `get_entity_raw`, which work with DataHub Cloud and current DataHub Core Graph APIs.

## How the agent works

```text
Proposed contract diff
        │
        ▼
DataHub metadata snapshot
  lineage · schema · owners · tags · tiers
        │
        ▼
Typed adjacency index + downstream traversal
        │
        ├── risk-ranked blast radius
        ├── accountable owner set
        ├── compatibility and policy findings
        └── phased rollout + generated SQL
```

Risk is deterministic and explainable. It combines:

- change kind (privacy, narrowing type, or rename);
- critical/Tier 1 consumers;
- policy-sensitive tags such as PII and SOX;
- lineage depth and number of downstream assets; and
- dashboard, ML-model, and activation semantics.

The output can be copied or exported as a Markdown checklist for a pull request.

## ARM64 optimization

LineageShield includes a reproducible optimization benchmark for the graph traversal hot path:

```bash
npm run benchmark
```

The baseline scans the full edge list for every visited node. The optimized path builds a compressed sparse row (CSR) index using `Uint32Array` offsets and targets, providing contiguous memory access and eliminating repeated edge scans.

Every push runs the benchmark on GitHub's native `ubuntu-24.04-arm` runner. The workflow:

- verifies that baseline and optimized traversals return exactly the same reachable set;
- records architecture, CPU, graph size, runtimes, and speedup;
- fails if the speedup is below 2×; and
- publishes `benchmark.json` as a workflow artifact.

Workflow: `.github/workflows/arm64-benchmark.yml`

### Verified ARM64 result

[GitHub Actions run #30307695875](https://github.com/nexicturbo/lineageshield/actions/runs/30307695875) completed successfully on native ARM64 Linux:

| Graph | Baseline median | CSR median | Speedup | Parity |
| --- | ---: | ---: | ---: | --- |
| 3,000 nodes / 8,997 edges | 138.203 ms | 0.070 ms | **1,963.94×** | 2,819 = 2,819 ✓ |

The workflow artifact records the architecture, Node version, full samples, graph shape, and result parity.

## Project structure

```text
app/                         interactive product experience
data/sample-snapshot.ts      DataHub-style demo metadata
lib/lineage.ts               traversal, risk, and rollout engine
scripts/datahub_snapshot.py  production DataHub snapshot exporter
bench/lineage-benchmark.mjs  baseline vs typed-array benchmark
.github/workflows/           native ARM64 verification
tests/                       rendered product checks
```

## Validation

```bash
npm run lint
npm test
npm run benchmark
```

## Privacy and security

- DataHub tokens are accepted only by the local exporter.
- The hosted demo does not request or store credentials.
- Snapshots contain metadata, not table rows.
- The repository contains no generated or embedded secrets.
- Export failures are explicit and auditable.

## License

Apache License 2.0. See [LICENSE](LICENSE).
