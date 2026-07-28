import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const targetUrn =
  "urn:li:dataset:(urn:li:dataPlatform:snowflake,PROD.CRM.CUSTOMERS,PROD)";

test("records the exact DataHub MCP context pipeline without leaking tokens", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "lineageshield-mcp-"));
  const output = join(temporaryDirectory, "context.json");
  const python =
    process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");

  try {
    const result = spawnSync(
      python,
      [
        "scripts/datahub_mcp_context.py",
        "--fixture",
        "examples/mcp/customer-email-change.fixture.json",
        "--query",
        "customer email",
        "--target-urn",
        targetUrn,
        "--output",
        output,
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DATAHUB_MCP_TOKEN: "fixture-secret-must-not-leak",
        },
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const context = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(context.format, "lineageshield-datahub-mcp-context-v1");
    assert.equal(context.targetUrn, targetUrn);
    assert.equal(context.query, "/q customer+email");
    assert.deepEqual(
      context.toolCalls.map(({ name }) => name),
      ["search", "get_entities", "list_schema_fields", "get_lineage"],
    );
    assert.equal(context.toolCalls[3].arguments.upstream, false);
    assert.equal(context.toolCalls[3].arguments.max_hops, 3);
    assert.equal(
      context.context.downstreamLineage.downstreams.searchResults.length,
      4,
    );
    assert.doesNotMatch(
      JSON.stringify(context),
      /fixture-secret-must-not-leak/,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
