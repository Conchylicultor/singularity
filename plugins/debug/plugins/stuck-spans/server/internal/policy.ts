import type { SpanKind } from "@plugins/infra/plugins/runtime-profiler/core";

// What the watchdog does with an open span of each kind: watch it against a
// threshold, or leave it alone for a stated reason. A union, so an excluded
// kind cannot carry a threshold nobody reads, and a watched one cannot lack one.
export type StuckSpanPolicy =
  { watch: true; thresholdMs: number } | { watch: false; why: string };

export type StuckSpanPolicyTable = Readonly<Record<SpanKind, StuckSpanPolicy>>;

// THE threshold table. Exhaustive over `SpanKind` by type, so a new span kind is
// a tsc error here until someone decides whether it is watched — it can never be
// silently ignored or silently watched.
//
// Why 90 s: nothing on these paths is meant to take anywhere near that long.
// A `flush` is milliseconds to a couple of seconds on a healthy backend (its
// since-boot peak on main was 1.8 s when this was written), and every live update
// in the worktree queues behind one — the 2026-09-11 incident was a flush open
// for 25+ minutes. It sits just past the app pool's 60 s query deadline on
// purpose: a span stuck on a lost DB query is cut off (and reported as
// db-query-deadline) before this fires, so this report means "stuck on something
// the deadline does not cover" and the two never describe the same hang.
//
// Why `http` gets 120 s: a request is admission-gated (endpoint concurrency,
// dedupe, the host-wide heavy-read budget) and can legitimately queue behind git
// work on a loaded host for tens of seconds. It is still interactive — someone
// is waiting on it — so two minutes is where "slow" has become "stuck".
export const STUCK_SPAN_POLICY: StuckSpanPolicyTable = {
  http: { watch: true, thresholdMs: 120_000 },
  sub: { watch: true, thresholdMs: 90_000 },
  loader: { watch: true, thresholdMs: 90_000 },
  push: { watch: true, thresholdMs: 90_000 },
  flush: { watch: true, thresholdMs: 90_000 },
  cascade: { watch: true, thresholdMs: 90_000 },
  job: {
    watch: false,
    why:
      "A job run already has its own wall-clock bound: the jobs worker aborts it " +
      "at its hold class's deadline and files job-deadline-exceeded, then " +
      "job-zombie if it keeps its slot (infra/jobs/deadline-audit). A second, " +
      "flat threshold here would contradict the per-class one. Watched spans " +
      "running INSIDE a job are still watched.",
  },
  bg: {
    watch: false,
    why:
      "runTracked roots include long-lived work by design (connect loops, " +
      "watchers, reconcilers), so an old bg span says nothing on its own. " +
      "Watched spans running INSIDE a bg root are still watched, with the bg " +
      "root named in their ancestor chain.",
  },
  db: {
    watch: false,
    why:
      "A leaf: a db query never opens an entry context, so it is never in the " +
      "open set. A hung query shows up as the age of the entry it runs inside.",
  },
};
