import { describe, expect, spyOn, test } from "bun:test";
import type { RawOpRecord } from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { createOpProfiler } from "./profiler";

// These tests drive `createOpProfiler` against an in-memory sink instead of the
// real `~/.singularity/op-log.jsonl`, so the profiler's record shape — and the
// one subtle clock-pairing invariant it maintains — has a regression test that
// never touches the user's real op log.

const baseOpts = { opId: "op-test", branch: "feature", opSlug: "wt-test" };

describe("createOpProfiler — injectable sink", () => {
  test("every phase lands on the injected sink, never the real op log", () => {
    const records: RawOpRecord[] = [];
    const p = createOpProfiler("build", { ...baseOpts, sink: (r) => records.push(r) });

    p.markRequested();
    p.markGranted();
    p.complete("success");
    p.write();

    expect(records.map((r) => r.phase)).toEqual(["requested", "granted", "completed"]);
    const completed = records.find((r) => r.phase === "completed");
    expect(completed?.outcome).toBe("success");
  });
});

describe("recordStep — grantedAt-relative offset via the perf pairing", () => {
  // The invariant under test: `markGranted` samples the wall clock (`grantedAt`)
  // and `performance.now()` (`grantedPerfMs`) as a PAIR at one instant, and
  // `recordStep` converts a `performance.now()`-relative start onto a
  // `grantedAt`-relative `OpStep.startMs` by subtracting against `grantedPerfMs`
  // — a plain monotonic subtraction with NO cross-clock arithmetic. A future
  // "simplification" to `Date.now()` inside `recordStep` would reintroduce the
  // ~6ms-under-load clock skew this pairing exists to avoid; these assertions
  // fail under that regression.
  test("startMs is the monotonic delta from the performance.now() sampled at markGranted", () => {
    const records: RawOpRecord[] = [];
    // Pin the monotonic clock so `markGranted` samples a KNOWN `grantedPerfMs`.
    // The value is deliberately unrelated to any wall-clock ms: a `Date.now()`
    // reimplementation could not reproduce these offsets.
    const perf = spyOn(performance, "now").mockReturnValue(10_000.5);
    try {
      const p = createOpProfiler("check", { ...baseOpts, sink: (r) => records.push(r) });
      p.markRequested();
      p.markGranted(); // grantedPerfMs = 10_000.5

      // A check reports a COMPLETED unit post-hoc: it hands the monotonic instant
      // its work started (an absolute `performance.now()` reading) plus the
      // measured duration. Two steps at different perf instants prove the offset
      // tracks the PERF delta — if `recordStep` read the wall clock instead, both
      // would collapse to ≈the same tiny number, not 200 and 900.
      p.recordStep("early", 10, 10_200.5); // 200ms after grant
      p.recordStep("late", 10, 10_900.5); //  900ms after grant
      // Fractional monotonic readings round onto the same integer-ms grid as the
      // waits: 10_500.5 - 10_000.5 = exactly 500.
      p.recordStep("rounds", 120, 10_500.5);

      p.complete("success");
      p.write();
    } finally {
      perf.mockRestore();
    }

    const completed = records.find((r) => r.phase === "completed");
    expect(completed?.steps).toEqual([
      { name: "early", startMs: 200, durationMs: 10 },
      { name: "late", startMs: 900, durationMs: 10 },
      { name: "rounds", startMs: 500, durationMs: 120 },
    ]);
  });

  test("a step recorded before markGranted pins to 0 (no reference instant yet)", () => {
    const records: RawOpRecord[] = [];
    const p = createOpProfiler("check", { ...baseOpts, sink: (r) => records.push(r) });

    // No `markGranted` — there is no reference instant, so the offset is 0 rather
    // than a subtraction against an undefined `grantedPerfMs`.
    p.recordStep("orphan", 30, 12_345.6);
    p.complete("success");
    p.write();

    const completed = records.find((r) => r.phase === "completed");
    expect(completed?.steps).toEqual([{ name: "orphan", startMs: 0, durationMs: 30 }]);
  });
});
