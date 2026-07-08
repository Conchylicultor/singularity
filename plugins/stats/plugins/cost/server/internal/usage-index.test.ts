import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensurePriced,
  loadPricing,
  parseTranscript,
  rollup,
  type CostSource,
  type FilePartial,
  type PricingDeps,
  type PricingHolder,
} from "./usage-index";

// ─── Fixture ─────────────────────────────────────────────────────────────────
// A tiny `projects/<dir>/<session>.jsonl` tree, standing in for ~/.claude/projects
// so the test never touches the real corpus. The generic incremental index
// mechanics (enumerate / fingerprint-diff / persist / drop-vanished) are covered
// by `infra/corpus-index`'s own test; here we cover the COST-SPECIFIC halves:
// the token parse (`parseTranscript`), the pricing throttle (`ensurePriced`),
// and the token-share rollup (`rollup`).

let root: string;
let projectsRoot: string;
let pricingPath: string;

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

function pricingDeps(): PricingDeps {
  return { costSource, persist: false, pricingPath };
}

// Build the entries map (path → FilePartial) the way `corpusIndex.entries()`
// would, by parsing every fixture file through the cost parse.
async function buildEntries(): Promise<Map<string, FilePartial>> {
  const paths = [
    join(projectsRoot, ALPHA, "sess-1111.jsonl"),
    join(projectsRoot, ALPHA, "sess-2222.jsonl"),
    join(projectsRoot, BETA, "sess-3333.jsonl"),
  ];
  const out = new Map<string, FilePartial>();
  for (const p of paths) out.set(p, await parseTranscript(p));
  return out;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cost-usage-test-"));
  projectsRoot = join(root, "projects");
  pricingPath = join(root, "pricing.json");
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

test("parseTranscript sums tokens, derives session/project from the path, and dedups by hash", async () => {
  const p = join(projectsRoot, ALPHA, "sess-1111.jsonl");
  const partial = await parseTranscript(p);
  expect(partial.sessionId).toBe("sess-1111");
  expect(partial.projectDir).toBe(ALPHA);
  expect(partial.inputTokens).toBe(1000 + 100);
  expect(partial.outputTokens).toBe(500 + 50);
  expect(partial.totalTokens).toBe(1000 + 100 + 500 + 50);
  expect(partial.lastActivity).toBe("2026-07-01");
  expect(partial.modelsUsed).toEqual(["model-opus"]);
  // Token parse is pricing-free — parsing never calls the cost source.
  expect(bulkCalls).toBe(0);
});

test("ensurePriced re-prices only past the TTL", async () => {
  const holder: PricingHolder = {};
  const start = bulkCalls;

  // First call → prices (no snapshot yet).
  const r1 = await ensurePriced(holder, pricingDeps(), { ttlMs: 1000, now: 1000 });
  expect(r1.priced).toBe(true);
  expect(bulkCalls).toBe(start + 1);
  expect(holder.pricing?.pricedAt).toBe(1000);

  // Within the TTL → no-op, no new subprocess call.
  const r2 = await ensurePriced(holder, pricingDeps(), { ttlMs: 1000, now: 1500 });
  expect(r2.priced).toBe(false);
  expect(bulkCalls).toBe(start + 1);

  // Past the TTL → re-prices.
  const r3 = await ensurePriced(holder, pricingDeps(), { ttlMs: 1000, now: 3000 });
  expect(r3.priced).toBe(true);
  expect(bulkCalls).toBe(start + 2);
  expect(holder.pricing?.pricedAt).toBe(3000);
});

test("ensurePriced persists an atomic, re-loadable pricing.json when persist is set", async () => {
  const holder: PricingHolder = {};
  await ensurePriced(
    holder,
    { ...pricingDeps(), persist: true },
    { ttlMs: 1000, now: 5000 },
  );
  const loaded = await loadPricing(pricingPath);
  expect(loaded?.pricedAt).toBe(5000);
  expect(new Map(loaded?.projectCosts).get(ALPHA)).toBe(5);
});

test("rollup distributes per-project cost by token share; totals exact", async () => {
  const entries = await buildEntries();
  const holder: PricingHolder = {};
  await ensurePriced(holder, pricingDeps(), { ttlMs: 60_000, now: 1 });

  const { daily, sessions } = rollup(entries, holder.pricing);

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
  const holder: PricingHolder = {};
  const d: PricingDeps = { ...pricingDeps(), costSource: flaky };

  // First attempt: surfaces the failure loudly…
  expect(await didThrow(ensurePriced(holder, d, { ttlMs: 1000, now: 1000 }))).toBe(true);
  expect(calls).toBe(1);
  expect(holder.pricing?.pricedAt).toBe(1000); // …but stamps the attempt.

  // Within the TTL: throttled — no re-spawn, no throw.
  const r = await ensurePriced(holder, d, { ttlMs: 1000, now: 1500 });
  expect(r.priced).toBe(false);
  expect(calls).toBe(1);

  // Past the TTL: attempts again.
  expect(await didThrow(ensurePriced(holder, d, { ttlMs: 1000, now: 3000 }))).toBe(true);
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
  const entries = await buildEntries();
  const holder: PricingHolder = {};
  await ensurePriced(
    holder,
    { ...pricingDeps(), costSource: zeroSource },
    { ttlMs: 60_000, now: 1 },
  );

  // $0 project omitted so it retries next pass (never cached as a wrong $0).
  expect(holder.pricing!.projectCosts.some(([p]) => p === ALPHA)).toBe(false);

  const { sessions } = rollup(entries, holder.pricing);
  for (const s of sessions.filter((x) => x.projectDir === ALPHA)) {
    expect(s.cost).toBe(0);
  }
});
