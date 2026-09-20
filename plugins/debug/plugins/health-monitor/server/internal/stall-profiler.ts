import { recordEventLoopStall } from "@plugins/debug/plugins/stall-monitor/server";
import {
  claimStackSampler,
  frameKey,
  type StackSample,
  type StackSampler,
} from "@plugins/infra/plugins/stack-sampler/core";
import type {
  StallSection,
  StallLeaf,
  StallStack,
} from "@plugins/debug/plugins/trace/plugins/stall/core";

// On-stall stack-trace capture. Folded into the health sampler's tick.
//
// Mechanism: JSC's sampling profiler runs on a SEPARATE thread, so it keeps
// sampling the blocked main-thread JS stack DURING a synchronous block — exactly
// the window where an on-demand "start profiling" request could never even be
// processed. We claim it once at sampler boot (main only) and drain it every
// tick. A drain returns only the samples since the last one, so a single
// drain-per-tick bounds memory AND aligns the captured samples to the same window
// as `eventLoopMaxMs`. The profiler itself — and every fact about bun:jsc's API
// (no stop, the directory-only argument, the varying rate, which frames are
// missing) — is owned by `infra/stack-sampler`; see its CLAUDE.md.
//
// Why drain-then-capture aligns: during a 40 s block no setInterval tick fires
// (the timer lives on the blocked loop), so the JSC buffer accumulates the entire
// block's samples; the first tick after the block reads histogram.max ≈ 40 s AND
// drains ~40 s of samples — both describe the same stall.
//
// On a stall the aggregated stacks are handed to `debug/stall-monitor` via
// `recordEventLoopStall`, NOT dumped to a dead-end JSONL. This sampler only
// DETECTS + AGGREGATES (drain + threshold gate + aggregateTraces); stall-monitor
// owns filing the trace AND the report. The trace surfaces in Debug → Slow Events
// like every other slow signal (rendered by the `trace/plugins/stall` event class
// as a histogram lane) and the report reaches the bell + Debug → Reports.
//
// The profiler has no stop, so `stopStallProfiler()` just disarms our consumer
// (we stop draining/capturing) and the JSC sampler thread idles harmlessly for
// the rest of the process. The real sample rate is derived per-dump from
// nSamples/window, never assumed.

// Matches the "stalls > 3 s" cohort the investigation tracks in health.jsonl.
const STALL_THRESHOLD_MS = 3_000;

// Cap the per-trace stack signature so a deep recursion can't bloat a line.
const MAX_SIGNATURE_FRAMES = 40;

const TOP_LEAVES = 15;
const TOP_STACKS = 10;

let sampler: StackSampler | null = null;

// Stack-sample observers — the `onSlowSpan` shape. Called once per drain (every
// 10 s tick while armed) with that window's samples. Armed always on main, and on
// another backend only once it has shown an elevated tick, so an observer there
// sees nothing until then. An observer must be cheap and must not throw.
export type StackSampleObserver = (
  samples: readonly StackSample[],
  windowMs: number,
) => void;
const stackSampleObservers = new Set<StackSampleObserver>();
export function onStackSamples(cb: StackSampleObserver): () => void {
  stackSampleObservers.add(cb);
  return () => stackSampleObservers.delete(cb);
}

// Render a source path relative to the worktree root so keys stay readable and
// stable (the absolute prefix is noise and machine-specific).
function shortenSource(sourceURL: string): string {
  const cwd = process.cwd();
  if (sourceURL.startsWith(cwd + "/")) return sourceURL.slice(cwd.length + 1);
  return sourceURL;
}

// Generic "hottest N entries of a histogram". The value type is open so a bucket
// can carry more than its count (stacks carry their representative frame keys);
// `countOf` is the only thing this needs to know about it.
function topN<V, T>(
  counts: Map<string, V>,
  total: number,
  n: number,
  countOf: (value: V) => number,
  build: (key: string, value: V, count: number, pct: number) => T,
): T[] {
  return [...counts.entries()]
    .sort((a, b) => countOf(b[1]) - countOf(a[1]))
    .slice(0, n)
    .map(([key, value]) => {
      const count = countOf(value);
      return build(key, value, count, Math.round((count / total) * 1000) / 10);
    });
}

// One stack-signature bucket: how many samples sat on this call path, plus the
// resolved frame keys of the FIRST trace seen with it.
//
// Why carry the frames at all: `stack` is names-only (it is the report's dedup
// grain — line-free, robust to edits), so nothing downstream can attribute it to
// a source location. Without this, `topLeaves` and `topStacks` are two
// INDEPENDENT histograms and the leaf↔stack association is lost: a consumer
// labelling the stall picks a leaf from one population while the fingerprint
// names a stack from the other, so the label can describe a different stall than
// the one being reported. That really happened — a `spawn`-rooted freeze (7/15
// samples) was titled with a 1-sample drizzle frame. Carrying the frames lets a
// consumer attribute the dominant stack using only THAT stack's own evidence.
//
// "Representative" is meant literally — these are ONE real sample's resolved
// keys, not a canonical attribution for the bucket. `frame.line` is the sample's
// EXECUTING line, not the function's declaration line, so two traces sharing a
// name-only signature can resolve to different keys: the Jul-16 stall's own
// evidence carries both `is @ …/entity.js:7` and `is @ …/entity.js:18` as
// separate leaves of the same `is` function. Keeping the first trace's keys is
// still enough for the job — a consumer wants "which subsystem is this call path
// in", and any real sample on the path answers that. Don't read `frames` as "the"
// position of the path; read it as "a" position on it.
interface StackBucket {
  count: number;
  frames: string[];
}

export function aggregateTraces(
  traces: readonly Pick<StackSample, "timestamp" | "frames">[],
): {
  topLeaves: StallLeaf[];
  topStacks: StallStack[];
} {
  const leafCounts = new Map<string, number>();
  const stackCounts = new Map<string, StackBucket>();
  let total = 0;

  for (const trace of traces) {
    const frames = trace.frames;
    if (!frames[0]) continue;
    total += 1;

    // Slice ONCE and derive both the leaf and the signature from the kept
    // frames, so `frames[0] === the leaf counted in topLeaves` holds by
    // construction rather than by two call sites agreeing.
    const kept = frames.slice(0, MAX_SIGNATURE_FRAMES);

    const leaf = frameKey(kept[0]!, shortenSource);
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);

    // Full collapsed stack signature, innermost → outermost (names only — keeps
    // it compact and groups by call path rather than exact source position).
    const signature = kept
      .map((f) => (f.name && f.name.length > 0 ? f.name : "?"))
      .join(" ← ");
    const seen = stackCounts.get(signature);
    if (seen) seen.count += 1;
    else
      stackCounts.set(signature, {
        count: 1,
        frames: kept.map((f) => frameKey(f, shortenSource)),
      });
  }

  if (total === 0) return { topLeaves: [], topStacks: [] };

  return {
    topLeaves: topN(
      leafCounts,
      total,
      TOP_LEAVES,
      (n) => n,
      (key, _bucket, count, pct) => ({ key, count, pct }),
    ),
    topStacks: topN(
      stackCounts,
      total,
      TOP_STACKS,
      (bucket) => bucket.count,
      (stack, bucket, count, pct) => ({
        stack,
        count,
        pct,
        frames: bucket.frames,
      }),
    ),
  };
}

export function startStallProfiler(): void {
  if (sampler) return;
  sampler = claimStackSampler("health-monitor");
}

// No JSC "stop" exists; we simply disarm the consumer. The sampler thread idles
// for the rest of the process lifetime, and a later `startStallProfiler()`
// re-claims the same handle (same owner).
export function stopStallProfiler(): void {
  sampler = null;
}

// Always drain (bounds memory + aligns the window). If the window stalled past
// the threshold, aggregate the drained samples and hand the section to
// stall-monitor (which files the trace + report); else discard. `windowMs` is the
// actual wall-time since the previous drain (the tick fires late after a block),
// so nSamples/window is the true sample rate.
export function drainAndMaybeDump(
  eventLoopMaxMs: number,
  windowMs: number,
): void {
  if (!sampler) return;
  const traces = sampler.drain();
  // Every drained batch, stall or not: what ran on the thread this window. Until
  // this seam the samples of a healthy window were thrown away, so "what does this
  // thread spend its time on" could only be answered during a freeze.
  if (traces.length > 0) {
    for (const observer of stackSampleObservers) observer(traces, windowMs);
  }

  if (eventLoopMaxMs <= STALL_THRESHOLD_MS) return; // not a stall — discard
  if (traces.length === 0) return; // nothing captured for this window

  const windowSeconds = windowMs / 1000;
  const sampleRateHz =
    windowSeconds > 0 ? Math.round(traces.length / windowSeconds) : 0;
  const { topLeaves, topStacks } = aggregateTraces(traces);

  const section: StallSection = {
    nSamples: traces.length,
    sampleRateHz,
    topLeaves,
    topStacks,
  };

  // Hand the aggregated evidence to the alert plugin, which owns both the trace
  // (critical, stable-labelled) and the deduped `event-loop-stall` report. This
  // sampler's job ends at detect + aggregate.
  recordEventLoopStall(section, eventLoopMaxMs, STALL_THRESHOLD_MS, windowMs);
}
