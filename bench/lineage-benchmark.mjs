import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";

const nodeCount = Number(process.env.BENCH_NODES ?? 3_000);
const fanout = Number(process.env.BENCH_FANOUT ?? 3);
const repeats = Number(process.env.BENCH_REPEATS ?? 7);

function makeDag(count, width) {
  const edges = [];
  let seed = 0x5f3759df;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  for (let from = 0; from < count - 1; from += 1) {
    for (let lane = 0; lane < width; lane += 1) {
      const jump = 1 + Math.floor(random() * Math.min(31, count - from - 1));
      edges.push([from, Math.min(count - 1, from + jump)]);
    }
  }
  return edges;
}

function baselineReachable(edges, origin) {
  const seen = new Uint8Array(nodeCount);
  const queue = [origin];
  let cursor = 0;
  let count = 0;
  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (seen[current]) continue;
    seen[current] = 1;
    count += 1;
    for (const [from, to] of edges) {
      if (from === current && !seen[to]) queue.push(to);
    }
  }
  return count;
}

function buildCsr(edges, count) {
  const offsets = new Uint32Array(count + 1);
  for (const [from] of edges) offsets[from + 1] += 1;
  for (let index = 1; index < offsets.length; index += 1) {
    offsets[index] += offsets[index - 1];
  }
  const targets = new Uint32Array(edges.length);
  const cursor = offsets.slice();
  for (const [from, to] of edges) {
    targets[cursor[from]++] = to;
  }
  return { offsets, targets };
}

function optimizedReachable(index, origin) {
  const seen = new Uint8Array(nodeCount);
  const queue = new Uint32Array(nodeCount * fanout + 1);
  let head = 0;
  let tail = 1;
  let count = 0;
  queue[0] = origin;
  while (head < tail) {
    const current = queue[head++];
    if (seen[current]) continue;
    seen[current] = 1;
    count += 1;
    for (
      let edge = index.offsets[current];
      edge < index.offsets[current + 1];
      edge += 1
    ) {
      const target = index.targets[edge];
      if (!seen[target]) queue[tail++] = target;
    }
  }
  return count;
}

function measure(task) {
  const samples = [];
  let result = 0;
  for (let iteration = 0; iteration < repeats; iteration += 1) {
    const started = performance.now();
    result = task();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: samples[Math.floor(samples.length / 2)], result, samples };
}

const edges = makeDag(nodeCount, fanout);
const csr = buildCsr(edges, nodeCount);
baselineReachable(edges, 0);
optimizedReachable(csr, 0);

const baseline = measure(() => baselineReachable(edges, 0));
const optimized = measure(() => optimizedReachable(csr, 0));

if (baseline.result !== optimized.result) {
  throw new Error(
    `Traversal parity failed: baseline=${baseline.result}, optimized=${optimized.result}`,
  );
}

const speedup = baseline.medianMs / optimized.medianMs;
const report = {
  benchmark: "LineageShield downstream blast-radius traversal",
  timestamp: new Date().toISOString(),
  runtime: {
    architecture: arch(),
    platform: platform(),
    release: release(),
    node: process.version,
    cpu: cpus()[0]?.model ?? "unknown",
  },
  graph: { nodes: nodeCount, edges: edges.length, fanout, repeats },
  parity: { reachableAssets: baseline.result, passed: true },
  baseline: { medianMs: Number(baseline.medianMs.toFixed(3)) },
  optimized: { medianMs: Number(optimized.medianMs.toFixed(3)) },
  speedup: Number(speedup.toFixed(2)),
  optimization:
    "CSR typed-array adjacency index replaces repeated full-edge scans.",
};

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/benchmark.json", JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));

if (speedup < 2) {
  throw new Error(`Expected at least 2x speedup; measured ${speedup.toFixed(2)}x.`);
}
