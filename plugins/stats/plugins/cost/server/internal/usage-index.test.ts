import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensurePriced,
  loadIndex,
  refreshIndex,
  rollup,
  type CostSource,
  type IndexDeps,
  type UsageIndex,
} from "./usage-index";

// ─── Fixture ─────────────────────────────────────────────────────────────────
// A tiny `projects/<dir>/<session>.jsonl` tree, standing in for ~/.claude/projects
// so the test never touches the real corpus.

let root: string;
let projectsRoot: string;
let indexPath: string;

const ALPHA = "-Users-me-proj-alpha";
const BETA = "-Users-me-proj-beta";

function entry(reqId: string, msgId: string, model: string, day: string, io: [number, number]) {
  return (
    JSON.stringify({
      timestamp: `${day}T10:00:00Z`,
      requestId: reqId,
      message: {
        id: msgId,
        model,
        usage: {
          input_tokens: io[0],
          output_tokens: io[1],
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }) + "\n"
  );
}

// Deterministic, network-free pricing stub: per-PROJECT exact totals (mirrors
// ccusage's per-project grouping). Counts calls so the TTL throttle is testable.
const PROJECT_COSTS = new Map<string, number>([
  [ALPHA, 5],
  [BETA, 3],
]);
let bulkCalls = 0;
const costSource: CostSource = {
  async bulkProjectCosts() {
    bulkCalls++;
    return new Map(PROJECT_COSTS);
  },
};

function deps(): IndexDeps {
  return { projectsRoot, indexPath, costSource, persist: false };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cost-usage-test-"));
  projectsRoot = join(root, "projects");
  indexPath = join(root, "index.json");
  await mkdir(join(projectsRoot, ALPHA), { recursive: true });
  await mkdir(join(projectsRoot, BETA), { recursive: true });
  await writeFile(
    join(projectsRoot, ALPHA, "sess-1111.jsonl"),
    entry("r1", "m1", "model-opus", "2026-07-01", [1000, 500]) +
      entry("r2", "m2", "model-opus", "2026-07-01", [100, 50]),
  );
  await writeFile(
    join(projectsRoot, ALPHA, "sess-2222.jsonl"),
    entry("r3", "m3", "model-sonnet", "2026-07-02", [10, 5]),
  );
  await writeFile(
    join(projectsRoot, BETA, "sess-3333.jsonl"),
    entry("r4", "m4", "model-opus", "2026-07-03", [5000, 2000]),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test("refreshIndex re-parses zero unchanged files and does NOT price", async () => {
  const index: UsageIndex = await loadIndex(indexPath);
  const before = bulkCalls;
  await refreshIndex(index, deps());

  expect(Object.keys(index.files).length).toBe(3);
  expect(index.pricing).toBeUndefined(); // token refresh never prices
  expect(bulkCalls).toBe(before); // …and never calls the cost source

  const snapshot = new Map(Object.entries(index.files));
  const { changed } = await refreshIndex(index, deps());
  expect(changed).toBe(false);
  for (const [path, e] of Object.entries(index.files)) {
    expect(e).toBe(snapshot.get(path)!); // same object → not re-parsed
  }
});

test("appending to one file re-parses exactly that file", async () => {
  const index: UsageIndex = await loadIndex(indexPath);
  await refreshIndex(index, deps());
  const before = new Map(Object.entries(index.files));

  const changedPath = join(projectsRoot, ALPHA, "sess-1111.jsonl");
  await appendFile(
    changedPath,
    entry("r5", "m5", "model-opus", "2026-07-01", [7, 3]),
  );

  await refreshIndex(index, deps());

  let reparsed = 0;
  for (const [path, e] of Object.entries(index.files)) {
    if (e !== before.get(path)) reparsed++;
  }
  expect(reparsed).toBe(1);
  expect(index.files[changedPath]!.partial.inputTokens).toBe(1000 + 100 + 7);
});

test("ensurePriced re-prices only past the TTL", async () => {
  const index: UsageIndex = { version: 2, files: {} };
  const start = bulkCalls;

  // First call → prices (no snapshot yet).
  const r1 = await ensurePriced(index, deps(), { ttlMs: 1000, now: 1000 });
  expect(r1.priced).toBe(true);
  expect(bulkCalls).toBe(start + 1);
  expect(index.pricing?.pricedAt).toBe(1000);

  // Within the TTL → no-op, no new subprocess call.
  const r2 = await ensurePriced(index, deps(), { ttlMs: 1000, now: 1500 });
  expect(r2.priced).toBe(false);
  expect(bulkCalls).toBe(start + 1);

  // Past the TTL → re-prices.
  const r3 = await ensurePriced(index, deps(), { ttlMs: 1000, now: 3000 });
  expect(r3.priced).toBe(true);
  expect(bulkCalls).toBe(start + 2);
  expect(index.pricing?.pricedAt).toBe(3000);
});

test("rollup distributes per-project cost by token share; totals exact", async () => {
  const index: UsageIndex = { version: 2, files: {} };
  await refreshIndex(index, deps());
  await ensurePriced(index, deps(), { ttlMs: 60_000, now: 1 });

  const { daily, sessions } = rollup(index);

  const sum = (rows: { totalCost?: number; cost?: number }[], key: "totalCost" | "cost") =>
    rows.reduce((s, r) => s + (r[key] ?? 0), 0);

  // Daily/total cost = sum of exact per-project totals (distribution conserves).
  const expectedTotal = PROJECT_COSTS.get(ALPHA)! + PROJECT_COSTS.get(BETA)!;
  expect(sum(sessions, "cost")).toBeCloseTo(expectedTotal, 10);
  expect(sum(daily, "totalCost")).toBeCloseTo(expectedTotal, 10);

  // BETA has a single session → its cost is the whole project total (exact).
  const beta = sessions.find((s) => s.sessionId === "sess-3333")!;
  expect(beta.cost).toBeCloseTo(3, 10);

  // ALPHA's $5 splits between its two sessions by token share.
  const s1 = sessions.find((s) => s.sessionId === "sess-1111")!;
  const s2 = sessions.find((s) => s.sessionId === "sess-2222")!;
  const alphaTokens = s1.totalTokens + s2.totalTokens;
  expect(s1.cost).toBeCloseTo((5 * s1.totalTokens) / alphaTokens, 10);
  expect(s2.cost).toBeCloseTo((5 * s2.totalTokens) / alphaTokens, 10);
});

// Resolves to whether `p` rejected (two-arg then avoids a bare catch and the
// non-thenable `.rejects` matcher).
function didThrow(p: Promise<unknown>): Promise<boolean> {
  return p.then(
    () => false,
    () => true,
  );
}

test("a failed pricing pass throttles the retry (one attempt per TTL)", async () => {
  let calls = 0;
  const flaky: CostSource = {
    async bulkProjectCosts() {
      calls++;
      throw new Error("subprocess exited 1: vanished file");
    },
  };
  const index: UsageIndex = { version: 2, files: {} };
  const d = { ...deps(), costSource: flaky };

  // First attempt: surfaces the failure loudly…
  expect(await didThrow(ensurePriced(index, d, { ttlMs: 1000, now: 1000 }))).toBe(true);
  expect(calls).toBe(1);
  expect(index.pricing?.pricedAt).toBe(1000); // …but stamps the attempt.

  // Within the TTL: throttled — no re-spawn, no throw.
  const r = await ensurePriced(index, d, { ttlMs: 1000, now: 1500 });
  expect(r.priced).toBe(false);
  expect(calls).toBe(1);

  // Past the TTL: attempts again.
  expect(await didThrow(ensurePriced(index, d, { ttlMs: 1000, now: 3000 }))).toBe(true);
  expect(calls).toBe(2);
});

test("a project with a $0 price is omitted from the map; rollup yields 0 for it", async () => {
  const zeroSource: CostSource = {
    async bulkProjectCosts() {
      // BETA priced, ALPHA unpriceable ($0 with tokens).
      return new Map([
        [ALPHA, 0],
        [BETA, 3],
      ]);
    },
  };
  const index: UsageIndex = { version: 2, files: {} };
  await refreshIndex(index, deps());
  await ensurePriced(
    index,
    { ...deps(), costSource: zeroSource },
    { ttlMs: 60_000, now: 1 },
  );

  // $0 project omitted so it retries next pass (never cached as a wrong $0).
  expect(index.pricing!.projectCosts.some(([p]) => p === ALPHA)).toBe(false);

  const { sessions } = rollup(index);
  for (const s of sessions.filter((x) => x.projectDir === ALPHA)) {
    expect(s.cost).toBe(0);
  }
});
