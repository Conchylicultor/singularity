import { describe, expect, spyOn, test } from "bun:test";
import type {
  OpEvent,
  OpSummary,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { createOpProfiler, type OpProfiler } from "./profiler";

// These tests drive `createOpProfiler` against an in-memory sink instead of the
// real `~/.singularity/logs/op-log/op-log.jsonl`, so the profiler's record shape — and the
// one subtle clock-pairing invariant it maintains — has a regression test that
// never touches the user's real op log.

const baseOpts = { opId: "op-test", branch: "feature", opSlug: "wt-test" };

/** The terminal's self-contained summary; throws when there is none. */
function summaryOf(records: OpEvent[]): OpSummary {
  const last = records.at(-1);
  if (last?.e !== "completed") throw new Error("no terminal event");
  return last.summary;
}

describe("createOpProfiler — injectable sink", () => {
  test("every phase lands on the injected sink, never the real op log", () => {
    const records: OpEvent[] = [];
    const p = createOpProfiler("build", {
      ...baseOpts,
      sink: (r) => records.push(r),
    });

    p.markRequested();
    p.markGranted();
    p.complete("success");
    p.write();

    expect(records.map((r) => r.e)).toEqual([
      "requested",
      "granted",
      "completed",
    ]);
    expect(summaryOf(records).outcome).toBe("success");
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
    const records: OpEvent[] = [];
    // Pin the monotonic clock so `markGranted` samples a KNOWN `grantedPerfMs`.
    // The value is deliberately unrelated to any wall-clock ms: a `Date.now()`
    // reimplementation could not reproduce these offsets.
    const perf = spyOn(performance, "now").mockReturnValue(10_000.5);
    try {
      const p = createOpProfiler("check", {
        ...baseOpts,
        sink: (r) => records.push(r),
      });
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

    expect(summaryOf(records).steps).toEqual([
      { name: "early", startMs: 200, durationMs: 10 },
      { name: "late", startMs: 900, durationMs: 10 },
      { name: "rounds", startMs: 500, durationMs: 120 },
    ]);
  });

  test("a step recorded before markGranted pins to 0 (no reference instant yet)", () => {
    const records: OpEvent[] = [];
    const p = createOpProfiler("check", {
      ...baseOpts,
      sink: (r) => records.push(r),
    });

    // No `markGranted` — there is no reference instant, so the offset is 0 rather
    // than a subtraction against an undefined `grantedPerfMs`.
    p.recordStep("orphan", 30, 12_345.6);
    p.complete("success");
    p.write();

    expect(summaryOf(records).steps).toEqual([
      { name: "orphan", startMs: 0, durationMs: 30 },
    ]);
  });
});

describe("createOpProfiler — every op kind", () => {
  // `OutcomeByKind` keys `complete()` per kind: the two grant-only kinds share
  // check's three-way vocabulary, and a push-shaped outcome is a type error.
  test("test and e2e run the full cycle with their own outcome vocabulary", () => {
    for (const kind of ["test", "e2e"] as const) {
      const records: OpEvent[] = [];
      const p = createOpProfiler(kind, {
        ...baseOpts,
        sink: (r) => records.push(r),
      });
      p.markRequested();
      p.grantHooks().onWaitStart?.();
      p.grantHooks().onAcquired?.(0);
      p.markGranted();
      p.complete("failed");
      p.write();
      const completed = summaryOf(records);
      expect(completed.kind).toBe(kind);
      expect(completed.outcome).toBe("failed");
      expect(completed.waits.map((w) => w.kind)).toEqual(["host-grant"]);
    }
  });

  test("a push-only outcome is rejected on a test op at the type level", () => {
    const p = createOpProfiler("test", { ...baseOpts, sink: () => {} });
    // @ts-expect-error — "failed_rebase" belongs to OutcomeByKind["push"] only.
    p.complete("failed_rebase");
  });
});

describe("createOpProfiler — the v2 event stream", () => {
  const run = (drive: (p: OpProfiler<"build">) => void): OpEvent[] => {
    const records: OpEvent[] = [];
    const p = createOpProfiler("build", {
      ...baseOpts,
      buildId: "b-1",
      sink: (r) => records.push(r),
    });
    drive(p);
    return records;
  };

  test("change-only deltas with a strictly increasing per-op seq", () => {
    const records = run((p) => {
      p.markRequested();
      p.waitStart("build-lock");
      p.markGranted();
      p.waitStart("duress-valve", "loadRatio");
      p.waitEnd("fail-open");
      p.requeue();
      p.grantHooks().onWaitStart?.();
      p.grantHooks().onAcquired?.(5);
      p.complete("success");
      p.write();
      p.write(); // idempotent
    });
    expect(records.map((r) => r.e)).toEqual([
      "requested",
      "wait-start",
      "wait-end", // build-lock, closed by markGranted
      "granted",
      "wait-start",
      "wait-end",
      "requeue",
      "wait-start",
      "wait-end",
      "completed",
    ]);
    expect(records.map((r) => r.seq)).toEqual(records.map((_, i) => i + 1));
    for (const r of records) {
      expect(r.v).toBe(2);
      expect(r.opId).toBe("op-test");
      expect(r.t).toBeGreaterThanOrEqual(0);
    }
    const req = records[0]!;
    expect(req.e === "requested" && req.pid).toBe(process.pid);

    const valveEnd = records[5]!;
    expect(valveEnd.e === "wait-end" && valveEnd.result).toBe("fail-open");
    expect(valveEnd.e === "wait-end" && valveEnd.reason).toBe("loadRatio");
    // Waits after the requeue carry the new cycle.
    const grantStart = records[7]!;
    expect(grantStart.e === "wait-start" && grantStart.cycle).toBe(1);

    const s = summaryOf(records);
    expect(s.kind).toBe("build");
    expect(s.buildId).toBe("b-1");
    expect(s.pid).toBe(process.pid);
    expect(s.grantedAt).not.toBeNull();
    expect(s.interrupted).toBe(false);
    expect(s.waits.map((w) => [w.kind, w.cycle, w.result])).toEqual([
      ["build-lock", 0, "acquired"],
      ["duress-valve", 0, "fail-open"],
      ["host-grant", 1, "acquired"],
    ]);
  });

  test("a fast-path grant emits ONE self-contained wait-end, no wait-start", () => {
    const records = run((p) => {
      p.markRequested();
      p.grantHooks().onAcquired?.(250);
      p.grantHooks().onAcquired?.(0); // zero-width: nothing recorded
    });
    expect(records.map((r) => r.e)).toEqual(["requested", "wait-end"]);
    const end = records[1]!;
    if (end.e !== "wait-end") throw new Error("expected wait-end");
    expect(end.wait).toBe("host-grant");
    expect(end.durationMs).toBe(250);
    expect(end.result).toBe("acquired");
    expect(end.cycle).toBe(0);
  });

  test("an event before markRequested lands the identity first", () => {
    const records = run((p) => {
      p.waitStart("push-mutex");
      p.markRequested(); // already written — no second `requested`
    });
    expect(records.map((r) => r.e)).toEqual(["requested", "wait-start"]);
  });

  test("an op killed mid-wait: the terminal closes the wait as aborted, ungranted", () => {
    const records = run((p) => {
      p.markRequested();
      p.waitStart("host-grant");
      p.write();
    });
    const s = summaryOf(records);
    expect(s.outcome).toBe("error");
    expect(s.grantedAt).toBeNull();
    expect(s.holdMs).toBe(0);
    expect(s.waits.map((w) => w.result)).toEqual(["aborted"]);
  });

  test("wait() closes acquired on return and aborted on throw", async () => {
    const records = run(() => {});
    const p = createOpProfiler("build", {
      ...baseOpts,
      sink: (r) => records.push(r),
    });
    await p.wait("build-lock", async () => 1);
    await p
      .wait("build-lock", async () => {
        throw new Error("boom");
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error) || err.message !== "boom") throw err;
      });
    const results = records.flatMap((r) =>
      r.e === "wait-end" ? [r.result] : [],
    );
    expect(results).toEqual(["acquired", "aborted"]);
  });
});
