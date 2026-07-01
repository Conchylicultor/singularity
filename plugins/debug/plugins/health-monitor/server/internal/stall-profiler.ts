import { join } from "node:path";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { startSamplingProfiler, samplingProfilerStackTraces } from "bun:jsc";
import { Log, type LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import { worktreeDataDir, currentWorktreeName } from "@plugins/infra/plugins/paths/server";

// On-stall stack-trace flight recorder. Folded into the health sampler's tick.
//
// Mechanism: JSC's sampling profiler runs on a SEPARATE thread, so it keeps
// sampling the blocked main-thread JS stack DURING a synchronous block — exactly
// the window where an on-demand "start profiling" request could never even be
// processed. We start it once at sampler boot (main only) and drain it every
// tick. Reading `samplingProfilerStackTraces()` DRAINS the buffer (returns only
// samples since the last read), so a single drain-per-tick bounds memory AND
// aligns the captured samples to the same window as `eventLoopMaxMs`.
//
// Why drain-then-dump aligns: during a 40 s block no setInterval tick fires (the
// timer lives on the blocked loop), so the JSC buffer accumulates the entire
// block's samples; the first tick after the block reads histogram.max ≈ 40 s AND
// drains ~40 s of samples — both describe the same stall.
//
// Note: bun:jsc (1.3.x) exposes `startSamplingProfiler` and
// `samplingProfilerStackTraces` but NO explicit stop. `stopStallProfiler()`
// therefore just disarms our consumer (we stop draining/dumping); the JSC sampler
// thread idles harmlessly. This is fine — the sampler lives for the process.
//
// `samplingProfilerStackTraces` exists at runtime but is absent from bun-types,
// so we augment the module below. `startSamplingProfiler(optionalDirectory?)`'s
// only arg is an output directory (NOT a numeric sample-interval — passing a
// number is meaningless), so we call it with no arg. The observed rate in this
// build is fixed at ~230 Hz; the real rate is derived per-dump from
// nSamples/window, never assumed.
declare module "bun:jsc" {
  export function samplingProfilerStackTraces(): {
    interval: number;
    traces: ProfilerTrace[];
  };
}

// Matches the "stalls > 3 s" cohort the investigation tracks in health.jsonl.
const STALL_THRESHOLD_MS = 3_000;

// Entries are a few KB each (~34/day ≈ ~100 KB/day); a modest cap is plenty.
const MAX_FILE_BYTES = 2_000_000;

// Cap the per-trace stack signature so a deep recursion can't bloat a line.
const MAX_SIGNATURE_FRAMES = 40;

const TOP_LEAVES = 15;
const TOP_STACKS = 10;

// JSC marks "no line/column/source" with this sentinel (0xFFFFFFFF).
const NO_LINE = 4_294_967_295;

interface ProfilerFrame {
  name?: string;
  sourceURL?: string;
  line?: number;
  column?: number;
  category?: string;
  flags?: number;
}

interface ProfilerTrace {
  timestamp: number;
  frames: ProfilerFrame[];
}

interface LeafEntry {
  key: string;
  count: number;
  pct: number;
}

interface StackEntry {
  stack: string;
  count: number;
  pct: number;
}

let armed = false;
let channel: LogChannel | null = null;

function stallFilePath(): string {
  return join(
    worktreeDataDir(currentWorktreeName()),
    "logs",
    "stall-profiles.jsonl",
  );
}

// Same bounded-without-a-job pattern as process-sampler's health rotation: trim
// to the newest half once the file grows past the cap. One sync rewrite per
// growth cycle; statSync is cheap and entries are tiny.
function rotateIfNeeded(): void {
  const file = stallFilePath();
  let size: number;
  try {
    size = statSync(file).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (size <= MAX_FILE_BYTES) return;
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join("\n") + "\n");
}

// Render a source path relative to the worktree root so keys stay readable and
// stable (the absolute prefix is noise and machine-specific).
function shortenSource(sourceURL: string): string {
  const cwd = process.cwd();
  if (sourceURL.startsWith(cwd + "/")) return sourceURL.slice(cwd.length + 1);
  return sourceURL;
}

// A leaf/frame identity key. JS frames → `name @ path:line`; native/unknown
// frames (no sourceURL, sentinel line) → `name [category]`.
function frameKey(frame: ProfilerFrame): string {
  const name = frame.name && frame.name.length > 0 ? frame.name : "(anonymous)";
  const hasSource =
    typeof frame.sourceURL === "string" &&
    frame.sourceURL.length > 0 &&
    typeof frame.line === "number" &&
    frame.line !== NO_LINE;
  if (hasSource) return `${name} @ ${shortenSource(frame.sourceURL!)}:${frame.line}`;
  const category = frame.category && frame.category.length > 0 ? frame.category : "native";
  return `${name} [${category}]`;
}

function topN<T>(
  counts: Map<string, number>,
  total: number,
  n: number,
  build: (key: string, count: number, pct: number) => T,
): T[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => build(key, count, Math.round((count / total) * 1000) / 10));
}

export function aggregateTraces(traces: ProfilerTrace[]): {
  topLeaves: LeafEntry[];
  topStacks: StackEntry[];
} {
  const leafCounts = new Map<string, number>();
  const stackCounts = new Map<string, number>();
  let total = 0;

  for (const trace of traces) {
    const frames = trace.frames;
    const innermost = frames?.[0];
    if (!innermost) continue;
    total += 1;

    const leaf = frameKey(innermost);
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);

    // Full collapsed stack signature, innermost → outermost (names only — keeps
    // it compact and groups by call path rather than exact source position).
    const signature = frames
      .slice(0, MAX_SIGNATURE_FRAMES)
      .map((f) => (f.name && f.name.length > 0 ? f.name : "?"))
      .join(" ← ");
    stackCounts.set(signature, (stackCounts.get(signature) ?? 0) + 1);
  }

  if (total === 0) return { topLeaves: [], topStacks: [] };

  return {
    topLeaves: topN(leafCounts, total, TOP_LEAVES, (key, count, pct) => ({ key, count, pct })),
    topStacks: topN(stackCounts, total, TOP_STACKS, (stack, count, pct) => ({ stack, count, pct })),
  };
}

export function startStallProfiler(): void {
  if (armed) return;
  channel = Log.channel("stall-profiles", { persist: true });
  startSamplingProfiler();
  armed = true;
}

// No JSC "stop" export exists; we simply disarm the consumer. The sampler thread
// idles for the rest of the process lifetime.
export function stopStallProfiler(): void {
  armed = false;
  channel = null;
}

// Always drain (bounds memory + aligns the window). If the window stalled past
// the threshold, aggregate the drained samples and append one line; else discard.
// `windowMs` is the actual wall-time since the previous drain (the tick fires
// late after a block), so nSamples/window is the true sample rate for the stall.
export function drainAndMaybeDump(
  eventLoopMaxMs: number,
  sampledAt: number,
  windowMs: number,
): void {
  if (!armed) return;
  const traces = samplingProfilerStackTraces().traces ?? [];

  if (eventLoopMaxMs <= STALL_THRESHOLD_MS) return; // not a stall — discard
  if (traces.length === 0) return; // nothing captured for this window

  const windowSeconds = windowMs / 1000;
  const sampleRateHz = windowSeconds > 0 ? Math.round(traces.length / windowSeconds) : 0;
  const { topLeaves, topStacks } = aggregateTraces(traces);

  rotateIfNeeded();
  channel?.publish(
    JSON.stringify({
      sampledAt,
      eventLoopMaxMs: Math.round(eventLoopMaxMs),
      nSamples: traces.length,
      sampleRateHz,
      topLeaves,
      topStacks,
    }),
  );
}
