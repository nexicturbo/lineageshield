# Customer email privacy rollout

DataHub MCP traced four downstream consumers across three hops from
`PROD.CRM.CUSTOMERS.email`. Because the source is tagged `PII` and `Tier1`,
LineageShield recommends a compatibility window instead of an in-place rewrite.

## Required approvals

- Customer Platform owns the source contract and hash normalization.
- Analytics Platform owns the `customer_360` compatibility view.
- Growth Analytics validates the Executive Retention dashboard.
- Lifecycle ML revalidates the churn model's feature distribution.
- Lifecycle Marketing validates the re-engagement activation audience.

## Phases

1. Add `email_sha256` and publish `CUSTOMER_CONTACT_V2` while retaining
   `email_legacy`.
2. Migrate the dashboard, model, and activation to the hashed field; compare
   row counts, null rates, and model drift.
3. Require all five owner approvals and seven stable days before blocking new
   plaintext consumers.
4. Remove `email_legacy` only after DataHub lineage reports no remaining
   downstream dependency on it.

## Evidence

The reproducible context trace is in
[`examples/mcp/lineageshield-mcp-context.json`](../mcp/lineageshield-mcp-context.json).
The generated compatibility SQL is in
[`customer-contact-safe.sql`](customer-contact-safe.sql).
