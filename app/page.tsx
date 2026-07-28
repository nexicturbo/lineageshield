"use client";

import { useMemo, useState } from "react";
import { sampleAssets, scenarios } from "../data/sample-snapshot";
import { analyzeLineage, type AssetImpact } from "../lib/lineage";

const typeLabel = {
  dataset: "DATASET",
  dashboard: "DASHBOARD",
  mlModel: "ML MODEL",
  activation: "ACTIVATION",
};

function AssetNode({ asset }: { asset: AssetImpact }) {
  return (
    <article className={`asset-node severity-${asset.severity}`}>
      <div className="asset-node-top">
        <span className={`platform-icon platform-${asset.type}`}>
          {asset.platform.slice(0, 2).toUpperCase()}
        </span>
        <span className="asset-type">{typeLabel[asset.type]}</span>
        <span className={`severity-dot severity-${asset.severity}`} />
      </div>
      <strong>{asset.name}</strong>
      <span className="asset-owner">{asset.owner}</span>
      <div className="asset-tags">
        {asset.tags.slice(0, 2).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}

export default function Home() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [status, setStatus] = useState<"ready" | "scanning" | "complete">(
    "complete",
  );
  const [copied, setCopied] = useState(false);

  const scenario =
    scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];
  const analysis = useMemo(
    () => analyzeLineage(sampleAssets, scenario),
    [scenario],
  );
  const depthGroups = useMemo(
    () =>
      Array.from({ length: analysis.maxDepth + 1 }, (_, depth) =>
        analysis.impacted.filter((asset) => asset.depth === depth),
      ),
    [analysis],
  );

  const selectScenario = (id: string) => {
    setScenarioId(id);
    setStatus("ready");
    setCopied(false);
  };

  const runAnalysis = () => {
    setStatus("scanning");
    setCopied(false);
    window.setTimeout(() => setStatus("complete"), 900);
  };

  const copyPlan = async () => {
    await navigator.clipboard.writeText(analysis.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const exportPlan = () => {
    const blob = new Blob([analysis.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lineageshield-${scenario.id}-rollout.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="LineageShield home">
          <span className="brand-mark">LS</span>
          <span>LineageShield</span>
        </a>
        <div className="topbar-center">
          <span className="connection-dot" />
          DataHub MCP · 4 read-only tools · recorded context ready
        </div>
        <div className="topbar-actions">
          <a
            className="text-link"
            href="https://github.com/nexicturbo/lineageshield"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <a className="button button-small button-dark" href="#workspace">
            Open agent
          </a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="kicker">
            <span>CONTEXT-GRAPH AGENT</span>
            BUILT ON DATAHUB
          </span>
          <h1>
            Ship schema changes
            <br />
            <em>without surprises.</em>
          </h1>
          <p>
            LineageShield turns a proposed data change into a verified blast
            radius, accountable owner map, and merge-ready rollout plan.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#workspace">
              Inspect a change <span>↓</span>
            </a>
            <span className="hero-note">
              <b>10</b> DataHub assets in this recorded sample
            </span>
          </div>
        </div>
        <div className="hero-aside" aria-label="How the agent works">
          <div className="agent-orbit">
            <span className="orbit-label orbit-top">LINEAGE</span>
            <span className="orbit-label orbit-right">OWNERS</span>
            <span className="orbit-label orbit-bottom">POLICIES</span>
            <span className="orbit-label orbit-left">SCHEMA</span>
            <div className="orbit-core">
              <span className="spark">✦</span>
              <b>CONTEXT</b>
              <small>GRAPH AGENT</small>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-section" id="workspace">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / THE WORKSPACE</span>
            <h2>One change. Every consequence.</h2>
          </div>
          <p>
            Choose a pull request. The public demo replays a recorded four-call
            DataHub MCP trace, traverses the metadata graph, and turns that
            context into an executable plan.
          </p>
        </div>

        <div className="workspace-shell">
          <aside className="scenario-panel">
            <div className="panel-label">PROPOSED CHANGES</div>
            <div className="scenario-list">
              {scenarios.map((item, index) => (
                <button
                  className={`scenario-card ${scenario.id === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => selectScenario(item.id)}
                >
                  <span className="scenario-number">0{index + 1}</span>
                  <span className="scenario-copy">
                    <small>{item.eyebrow}</small>
                    <strong>{item.title}</strong>
                    <span>{item.summary}</span>
                  </span>
                  <span className="scenario-arrow">↗</span>
                </button>
              ))}
            </div>
            <div className="change-contract">
              <span className="panel-label">CONTRACT DIFF</span>
              <div>
                <span className="diff-minus">−</span>
                <code>{scenario.before}</code>
              </div>
              <div>
                <span className="diff-plus">+</span>
                <code>{scenario.after}</code>
              </div>
              <p>
                Field: <b>{scenario.targetField}</b>
              </p>
            </div>
            <button
              className={`button analyze-button ${status === "scanning" ? "is-scanning" : ""}`}
              onClick={runAnalysis}
              disabled={status === "scanning"}
            >
              <span>{status === "scanning" ? "Scanning graph" : "Analyze change"}</span>
              <span>{status === "scanning" ? "···" : "✦"}</span>
            </button>
          </aside>

          <div className="analysis-panel">
            <div className="analysis-toolbar">
              <div>
                <span className="panel-label">DATAHUB CONTEXT GRAPH</span>
                <strong>{scenario.title}</strong>
              </div>
              <div className="analysis-status">
                <span className={status === "complete" ? "pulse" : ""} />
                {status === "scanning"
                  ? "TRAVERSING LINEAGE"
                  : status === "ready"
                    ? "READY TO ANALYZE"
                    : "ANALYSIS COMPLETE"}
              </div>
            </div>

            <div
              className={`graph-canvas ${status === "scanning" ? "graph-scanning" : ""}`}
            >
              <div className="graph-grid">
                {depthGroups.map((group, depth) => (
                  <div className="graph-column" key={depth}>
                    <div className="depth-label">
                      {depth === 0 ? "CHANGE ORIGIN" : `DEPTH ${depth}`}
                    </div>
                    <div className="node-stack">
                      {group.map((asset) => (
                        <AssetNode asset={asset} key={asset.urn} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="scan-line" />
            </div>

            <div className="metric-strip">
              <div>
                <span>AFFECTED</span>
                <strong>{analysis.impacted.length}</strong>
                <small>assets</small>
              </div>
              <div>
                <span>CRITICAL</span>
                <strong>{analysis.criticalCount}</strong>
                <small>need sign-off</small>
              </div>
              <div>
                <span>OWNERS</span>
                <strong>{analysis.owners.length}</strong>
                <small>teams</small>
              </div>
              <div className="risk-metric">
                <span>CHANGE RISK</span>
                <strong>{analysis.riskScore}</strong>
                <small>/ 100 · {analysis.riskLabel}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="section-heading report-heading">
          <div>
            <span className="section-index">02 / AGENT OUTPUT</span>
            <h2>A rollout teams can execute.</h2>
          </div>
          <div className="confidence">
            <span>CONTEXT CONFIDENCE</span>
            <b>{analysis.confidence}%</b>
          </div>
        </div>

        <div className="report-grid">
          <article className="findings-card report-card">
            <div className="card-header">
              <span>IMPACT BRIEF</span>
              <span className={`risk-pill risk-${analysis.riskLabel.toLowerCase()}`}>
                {analysis.riskLabel} risk
              </span>
            </div>
            <h3>{scenario.title}</h3>
            <p className="report-lead">
              The proposal reaches production decisions beyond its immediate
              contract. LineageShield recommends a compatibility window.
            </p>
            <div className="finding-list">
              {analysis.findings.map((finding, index) => (
                <div key={finding}>
                  <span>0{index + 1}</span>
                  <p>{finding}</p>
                </div>
              ))}
            </div>
            <div className="context-source">
              <span>CONTEXT USED</span>
              <div>
                {["Lineage", "Ownership", "Tags", "Tiers", "Schema"].map(
                  (item) => (
                    <b key={item}>✓ {item}</b>
                  ),
                )}
              </div>
            </div>
          </article>

          <article className="rollout-card report-card">
            <div className="card-header">
              <span>SAFE ROLLOUT PLAN</span>
              <span>{analysis.phases.length} phases</span>
            </div>
            <div className="phase-list">
              {analysis.phases.map((phase) => (
                <div className="phase" key={phase.label}>
                  <span className="phase-number">{phase.label}</span>
                  <div>
                    <div className="phase-title">
                      <h3>{phase.title}</h3>
                      <span>{phase.owner}</span>
                    </div>
                    <ul>
                      {phase.checks.map((check) => (
                        <li key={check}>
                          <span>□</span>
                          {check}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="report-actions">
              <button className="button button-dark" onClick={exportPlan}>
                Export Markdown ↓
              </button>
              <button className="button button-outline" onClick={copyPlan}>
                {copied ? "Copied ✓" : "Copy plan"}
              </button>
            </div>
          </article>
        </div>

        <div className="guardrail-card">
          <div className="guardrail-copy">
            <span className="section-index">GENERATED GUARDRAIL</span>
            <h3>Compatibility SQL, ready for review.</h3>
            <p>
              The agent converts graph context into a concrete guardrail—not
              another generic summary.
            </p>
          </div>
          <pre>
            <code>{analysis.generatedSql}</code>
          </pre>
        </div>
      </section>

      <section className="architecture-section">
        <span className="section-index">03 / BUILT FOR REAL METADATA</span>
        <div className="architecture-grid">
          <h2>
            DataHub supplies the context.
            <br />
            LineageShield makes it actionable.
          </h2>
          <div className="architecture-context">
            <div className="architecture-flow">
              <div>
                <span>01</span>
                <b>MCP Context</b>
                <small>search + entities + schema + lineage</small>
              </div>
              <i>→</i>
              <div>
                <span>02</span>
                <b>Traverse</b>
                <small>Typed adjacency index maps blast radius</small>
              </div>
              <i>→</i>
              <div>
                <span>03</span>
                <b>Act</b>
                <small>Agent generates checks, owners, and SQL</small>
              </div>
            </div>
            <a
              className="text-link mcp-trace-link"
              href="https://github.com/nexicturbo/lineageshield/blob/main/examples/mcp/lineageshield-mcp-context.json"
              target="_blank"
              rel="noreferrer"
            >
              Inspect the reproducible DataHub MCP trace →
            </a>
          </div>
        </div>
        <a
          className="benchmark-proof"
          href="https://github.com/nexicturbo/lineageshield/actions/runs/30307695875"
          target="_blank"
          rel="noreferrer"
        >
          <div>
            <span>NATIVE ARM64 · VERIFIED</span>
            <b>1,963.94×</b>
            <small>faster median traversal</small>
          </div>
          <div>
            <span>BASELINE</span>
            <b>138.203 ms</b>
            <small>repeated edge scans</small>
          </div>
          <div>
            <span>OPTIMIZED</span>
            <b>0.070 ms</b>
            <small>CSR typed-array index</small>
          </div>
          <div>
            <span>EXACT PARITY</span>
            <b>2,819 = 2,819</b>
            <small>reachable assets · view run ↗</small>
          </div>
        </a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark">LS</span>
          <span>LineageShield</span>
        </a>
        <p>
          An open-source context-graph agent built for the DataHub Agent
          Hackathon.
        </p>
        <a
          className="text-link"
          href="https://github.com/nexicturbo/lineageshield"
          target="_blank"
          rel="noreferrer"
        >
          View source ↗
        </a>
      </footer>
    </main>
  );
}
