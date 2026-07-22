#!/usr/bin/env bun
/**
 * js-interrogate.ts — automated JS-level interrogation of a live-wedged bun
 * process over its pre-armed inspector (`bun --inspect`). Runs the exact
 * protocol that named the wedge's hot function on 2026-07-22
 * (research/2026-07-22-global-cli-op-wedge-named-function.md):
 *
 *   1. stash `bun:jsc` into a global via dynamic import (`require` does not
 *      exist in Runtime.evaluate scope — verified),
 *   2. JSC internal sampling profiler (`startSamplingProfiler`), accumulate
 *      `--seconds` (default 60) — this is the mode that captures a NATIVE
 *      microtask storm, where the inspector's ScriptProfiler records 0 samples,
 *   3. heapStats before/after → allocation delta,
 *   4. `samplingProfilerStackTraces()` → per-stack counts, summarized IN the
 *      target so a healthy full-burn op cannot flood the pipe,
 *   5. `getProtectedObjects()` HISTOGRAM ONLY.
 *
 * HARD RULE: never `jscDescribe` / deep-introspect protected internal objects.
 * That exact probe SIGTRAP-crashed the 2026-07-22 specimen (EXC_BREAKPOINT,
 * `bun-2026-07-22-014331.ips`). A histogram of constructor names is safe;
 * describing the objects is specimen-killing.
 *
 * Prints ONE JSON document (JsInterrogation) to stdout — including on partial
 * failure; per-step errors land in `failures` rather than aborting the run.
 * Usage: bun js-interrogate.ts ws://localhost:PORT/TOKEN [--seconds N]
 */

import { connectInspector, evalInTarget, type InspectorRpc } from "./inspector-rpc";

export interface JsInterrogation {
  wsUrl: string;
  seconds: number;
  traceCount: number | null;
  /** Top sampled JS stacks, most frequent first: "leaf < caller < …" chains. */
  topStacks: Array<{ stack: string; count: number }>;
  /** Up to 50 raw traces for fidelity (frames as name|category|location). */
  rawTraces: string[][];
  heap: {
    t0: Record<string, number>;
    t1: Record<string, number>;
    wallMs: number;
  } | null;
  protectedHistogram: { total: number; byKind: Record<string, number> } | null;
  failures: Array<{ step: string; error: string }>;
}

const args = process.argv.slice(2);
const wsUrl = args[0];
if (wsUrl === undefined) {
  console.error("usage: js-interrogate.ts <ws-url> [--seconds N]");
  process.exit(2);
}
const secIdx = args.indexOf("--seconds");
const seconds = secIdx >= 0 ? Math.max(3, Number(args[secIdx + 1] ?? "60")) : 60;

const out: JsInterrogation = {
  wsUrl,
  seconds,
  traceCount: null,
  topStacks: [],
  rawTraces: [],
  heap: null,
  protectedHistogram: null,
  failures: [],
};
const fail = (step: string, err: unknown): void => {
  out.failures.push({ step, error: err instanceof Error ? err.message : String(err) });
};

// Self-terminating: whatever happens, the collected partial JSON is printed and
// the process exits. The server side holds its own outer deadline too.
const hardDeadline = setTimeout(() => {
  fail("deadline", `internal deadline (${seconds + 45}s) fired — emitting partial result`);
  finish();
}, (seconds + 45) * 1000);
hardDeadline.unref();

function finish(): never {
  console.log(JSON.stringify(out));
  // Always exit 0: the JSON's `failures` array IS the failure signal. A
  // non-zero exit would make the caller's bounded-spawn helper discard stdout —
  // i.e. throw away the partial evidence this script exists to preserve.
  process.exit(0);
}

// Globals stashed in the TARGET are namespaced __oww* so a re-run (or a manual
// session) cannot collide with the target's own state.
const HEAP_EXPR =
  '(() => { const h = globalThis.__owwJsc.heapStats(); const m = process.memoryUsage(); ' +
  "return JSON.stringify({ t: Date.now(), heapSize: h.heapSize, heapCapacity: h.heapCapacity, " +
  "extraMemorySize: h.extraMemorySize, objectCount: h.objectCount, " +
  "protectedObjectCount: h.protectedObjectCount, rss: m.rss }); })()";

let rpc: InspectorRpc | null = null;
try {
  rpc = await connectInspector(wsUrl);
} catch (err) {
  fail("connect", err);
  finish();
}

// --- 1. stash bun:jsc (dynamic import resolves via the target's microtask
//     drain, which demonstrably runs even mid-wedge).
try {
  await evalInTarget(rpc, 'void import("bun:jsc").then((m) => { globalThis.__owwJsc = m; }); "ok"');
  const t0 = Date.now();
  let loaded = false;
  while (Date.now() - t0 < 5000) {
    if ((await evalInTarget(rpc, "!!globalThis.__owwJsc")) === true) {
      loaded = true;
      break;
    }
    await Bun.sleep(200);
  }
  if (!loaded) throw new Error("bun:jsc import did not resolve in target within 5s");
} catch (err) {
  fail("stash-jsc", err);
  finish(); // every later step needs the module
}

// --- 2. start the JSC internal sampling profiler + heapStats t0.
let heapT0: Record<string, number> | null = null;
try {
  await evalInTarget(rpc, 'globalThis.__owwJsc.startSamplingProfiler(); "started"');
} catch (err) {
  fail("start-profiler", err);
}
try {
  heapT0 = JSON.parse((await evalInTarget(rpc, HEAP_EXPR)) as string) as Record<string, number>;
} catch (err) {
  fail("heap-t0", err);
}

// --- 3. accumulate.
await Bun.sleep(seconds * 1000);

// --- 4. heapStats t1.
try {
  const heapT1 = JSON.parse((await evalInTarget(rpc, HEAP_EXPR)) as string) as Record<string, number>;
  if (heapT0 !== null) {
    out.heap = { t0: heapT0, t1: heapT1, wallMs: (heapT1.t ?? 0) - (heapT0.t ?? 0) };
  }
} catch (err) {
  fail("heap-t1", err);
}

// --- 5. collect + summarize traces IN the target (a healthy full-burn op can
//     accumulate tens of thousands of samples; only counts cross the wire).
try {
  const summary = (await evalInTarget(
    rpc,
    "(() => { const t = globalThis.__owwJsc.samplingProfilerStackTraces(); " +
      "const key = (tr) => tr.frames.slice(0, 4).map((f) => " +
      '(f.name || "?") + "|" + f.category + "|" + f.location.split(":").slice(1).join(":")).join(" < "); ' +
      "const c = new Map(); const raw = []; " +
      "for (const tr of t.traces) { const k = key(tr); c.set(k, (c.get(k) ?? 0) + 1); " +
      "if (raw.length < 50) raw.push(tr.frames.map((f) => " +
      '(f.name || "?") + "|" + f.category + "|" + f.location)); } ' +
      "return JSON.stringify({ total: t.traces.length, " +
      "top: [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20), raw }); })()",
    30000,
  )) as string;
  const parsed = JSON.parse(summary) as {
    total: number;
    top: Array<[string, number]>;
    raw: string[][];
  };
  out.traceCount = parsed.total;
  out.topStacks = parsed.top.map(([stack, count]) => ({ stack, count }));
  out.rawTraces = parsed.raw;
} catch (err) {
  fail("traces", err);
}

// --- 6. protected-object histogram. Constructor-name counts ONLY — see the
//     jscDescribe prohibition in the header.
try {
  const hist = (await evalInTarget(
    rpc,
    "(() => { const p = globalThis.__owwJsc.getProtectedObjects(); const h = {}; " +
      "for (const o of p) { let k; " +
      'try { k = o === null ? "null" : typeof o === "object" ? ' +
      "(o.constructor?.name ?? Object.prototype.toString.call(o)) : " +
      'typeof o === "function" ? "fn:" + (o.name || "anon") : typeof o; } catch (e) { k = "err"; } ' +
      "h[k] = (h[k] ?? 0) + 1; } " +
      "return JSON.stringify({ total: p.length, byKind: h }); })()",
    15000,
  )) as string;
  out.protectedHistogram = JSON.parse(hist) as { total: number; byKind: Record<string, number> };
} catch (err) {
  fail("protected-histogram", err);
}

rpc.close();
finish();
