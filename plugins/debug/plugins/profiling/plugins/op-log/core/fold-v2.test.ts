import { describe, expect, test } from "bun:test";
import {
  applyOpEvent,
  foldOpLines,
  liveTimes,
  orphanedOps,
  reconcilerCompletedEvent,
  toOpRecord,
} from "./internal/fold";
import {
  WAIT_KINDS,
  type OpEvent,
  type OpFoldState,
  type OpSummary,
} from "./internal/types";

// The v2 change-only event stream through the one reducer. `now` is injected
// everywhere, so every live number is pinned against a fixed clock.

const T0 = Date.parse("2026-09-29T10:00:00.000Z");
const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

type Body = OpEvent extends infer E
  ? E extends OpEvent
    ? Omit<E, "v" | "opId" | "seq" | "at" | "t">
    : never
  : never;

/** A v2 event for `op-1`, `offset` ms after the request (on both clocks). */
const ev = (seq: number, offset: number, body: Body, opId = "op-1"): OpEvent =>
  ({ v: 2, opId, seq, at: at(offset), t: offset, ...body }) as OpEvent;

const requested = (opId = "op-1"): OpEvent =>
  ev(
    1,
    0,
    {
      e: "requested",
      kind: "build",
      opSlug: "wt-a",
      branch: "feature",
      conversationId: "conv-1",
      lane: "background",
      mode: null,
      buildId: "b-1",
      pid: 4242,
    },
    opId,
  );

const summary = (over: Partial<OpSummary> = {}): OpSummary => ({
  kind: "build",
  opSlug: "wt-a",
  branch: "feature",
  conversationId: "conv-1",
  lane: "background",
  mode: null,
  buildId: "b-1",
  pid: 4242,
  requestedAt: at(0),
  grantedAt: at(1_000),
  completedAt: at(100_000),
  waits: [
    {
      kind: "build-lock",
      startMs: 0,
      durationMs: 1_000,
      reason: null,
      cycle: 0,
      result: "acquired",
    },
  ],
  holdMs: 99_000,
  totalMs: 100_000,
  outcome: "success",
  interrupted: false,
  steps: [{ name: "vite", startMs: 10_000, durationMs: 50_000 }],
  ...over,
});

const stateOf = (lines: OpEvent[]): OpFoldState =>
  foldOpLines(lines).get("op-1")!;

/** A build parked in the duress valve on its second requeue cycle. */
const parkedBuild: OpEvent[] = [
  requested(),
  ev(2, 0, { e: "wait-start", wait: "build-lock", reason: null, cycle: 0 }),
  ev(3, 1_000, {
    e: "wait-end",
    wait: "build-lock",
    startMs: 0,
    durationMs: 1_000,
    result: "acquired",
    reason: null,
    cycle: 0,
  }),
  ev(4, 1_000, { e: "granted" }),
  ev(5, 60_000, {
    e: "wait-start",
    wait: "duress-valve",
    reason: "loadRatio",
    cycle: 0,
  }),
  ev(6, 90_000, {
    e: "wait-end",
    wait: "duress-valve",
    startMs: 60_000,
    durationMs: 30_000,
    result: "cleared",
    reason: "loadRatio",
    cycle: 0,
  }),
  ev(7, 90_000, {
    e: "wait-start",
    wait: "host-grant",
    reason: null,
    cycle: 0,
  }),
  ev(8, 120_000, {
    e: "wait-end",
    wait: "host-grant",
    startMs: 90_000,
    durationMs: 30_000,
    result: "acquired",
    reason: null,
    cycle: 0,
  }),
  ev(9, 120_000, { e: "requeue", cycle: 1, cause: "duress" }),
  ev(10, 120_000, {
    e: "wait-start",
    wait: "duress-valve",
    reason: "loadRatio",
    cycle: 1,
  }),
];

describe("v2 — in flight", () => {
  test("a parked build: open wait, reason, cycle, closed waits kept", () => {
    const s = stateOf(parkedBuild);
    expect(s.cycle).toBe(1);
    expect(s.lastSeq).toBe(10);
    expect(s.openWait).toEqual({
      kind: "duress-valve",
      startMs: 120_000,
      startedAt: at(120_000),
      reason: "loadRatio",
      cycle: 1,
    });
    expect(s.waits.map((w) => [w.kind, w.result, w.cycle])).toEqual([
      ["build-lock", "acquired", 0],
      ["duress-valve", "cleared", 0],
      ["host-grant", "acquired", 0],
    ]);

    const rec = toOpRecord(s, T0 + 180_000)!;
    expect(rec.outcome).toBe("running");
    expect(rec.pid).toBe(4242);
    expect(rec.cycle).toBe(1);
    expect(rec.openWait?.reason).toBe("loadRatio");
    // The open wait is clocked into the list for the Gantt.
    expect(rec.waits.at(-1)).toEqual({
      kind: "duress-valve",
      startMs: 120_000,
      durationMs: 60_000,
      reason: "loadRatio",
      cycle: 1,
      result: null,
    });
    expect(rec.waitMs).toBe(1_000 + 30_000 + 30_000 + 60_000);
    expect(rec.holdMs).toBe(179_000);
    expect(rec.totalMs).toBe(180_000);
  });

  test("before `granted` the op is waiting", () => {
    const rec = toOpRecord(stateOf(parkedBuild.slice(0, 2)), T0 + 5_000)!;
    expect(rec.outcome).toBe("waiting");
    expect(rec.grantedAt).toBe(rec.requestedAt);
    expect(rec.holdMs).toBe(0);
    expect(rec.openWait?.kind).toBe("build-lock");
  });

  test("a fail-open valve wait records its result", () => {
    const s = stateOf([
      requested(),
      ev(2, 0, {
        e: "wait-start",
        wait: "duress-valve",
        reason: "memory",
        cycle: 0,
      }),
      ev(3, 1_800_000, {
        e: "wait-end",
        wait: "duress-valve",
        startMs: 0,
        durationMs: 1_800_000,
        result: "fail-open",
        reason: "memory",
        cycle: 0,
      }),
    ]);
    expect(s.openWait).toBeNull();
    expect(s.waits[0]?.result).toBe("fail-open");
    expect(s.waits[0]?.reason).toBe("memory");
  });

  test("a fast-path grant's lone wait-end is self-contained", () => {
    const s = stateOf([
      requested(),
      ev(2, 5_000, {
        e: "wait-end",
        wait: "host-grant",
        startMs: 4_000,
        durationMs: 1_000,
        result: "acquired",
        reason: null,
        cycle: 0,
      }),
    ]);
    expect(s.waits).toHaveLength(1);
    expect(s.waits[0]?.startMs).toBe(4_000);
    expect(s.openWait).toBeNull();
  });

  test("a wait-start over an open wait closes the old one as aborted", () => {
    const s = stateOf([
      requested(),
      ev(2, 0, { e: "wait-start", wait: "build-lock", reason: null, cycle: 0 }),
      ev(3, 3_000, {
        e: "wait-start",
        wait: "host-grant",
        reason: null,
        cycle: 0,
      }),
    ]);
    expect(s.waits).toEqual([
      {
        kind: "build-lock",
        startMs: 0,
        durationMs: 3_000,
        reason: null,
        cycle: 0,
        result: "aborted",
      },
    ]);
    expect(s.openWait?.kind).toBe("host-grant");
  });
});

describe("v2 — seq idempotency", () => {
  test("re-applying the same lines changes nothing", () => {
    const once = stateOf(parkedBuild);
    let again = once;
    for (const line of parkedBuild) again = applyOpEvent(again, line);
    expect(again).toEqual(once);
  });

  test("a replayed earlier event is ignored (seq <= lastSeq)", () => {
    const s = stateOf(parkedBuild);
    const replay = applyOpEvent(s, parkedBuild[2]!); // the build-lock wait-end
    expect(replay).toBe(s);
    expect(replay.waits).toHaveLength(3);
  });

  test("applyOpEvent never mutates its input", () => {
    const s = stateOf(parkedBuild.slice(0, 4));
    const snapshot = structuredClone(s);
    applyOpEvent(s, parkedBuild[4]!);
    expect(s).toEqual(snapshot);
  });
});

describe("v2 — terminal", () => {
  const completed = ev(20, 100_000, {
    e: "completed",
    by: "self",
    summary: summary(),
  });

  test("the summary overwrites the state and freezes the numbers", () => {
    const s = stateOf([...parkedBuild, completed]);
    expect(s.closedBy).toBe("self");
    expect(s.openWait).toBeNull();
    const rec = toOpRecord(s, T0 + 999_999)!;
    expect(rec.outcome).toBe("success");
    expect(rec.totalMs).toBe(100_000);
    expect(rec.holdMs).toBe(99_000);
    expect(rec.waits).toEqual(summary().waits);
    expect(rec.steps).toHaveLength(1);
    expect(rec.openWait).toBeNull();
    expect(rec.closedBy).toBe("self");
  });

  test("terminal wins: every event after it is ignored", () => {
    const s = stateOf([
      ...parkedBuild,
      completed,
      ev(21, 200_000, {
        e: "wait-start",
        wait: "host-grant",
        reason: null,
        cycle: 3,
      }),
      ev(22, 200_000, {
        e: "completed",
        by: "reconciler",
        summary: summary({ interrupted: true, outcome: "error" }),
      }),
    ]);
    expect(s.closedBy).toBe("self");
    expect(s.outcome).toBe("success");
    expect(s.openWait).toBeNull();
  });

  test("a terminal applies even with a seq below lastSeq", () => {
    const s = stateOf([
      ...parkedBuild,
      ev(1, 100_000, { e: "completed", by: "self", summary: summary() }),
    ]);
    expect(s.closedBy).toBe("self");
  });

  test("a headless op (requested clipped away) renders nothing until its terminal", () => {
    const tail = parkedBuild.slice(4); // no `requested`
    expect(toOpRecord(stateOf(tail), T0 + 200_000)).toBeNull();
    // The self-contained terminal alone is a full record.
    const rec = toOpRecord(stateOf([...tail, completed]), T0)!;
    expect(rec.kind).toBe("build");
    expect(rec.opSlug).toBe("wt-a");
    expect(rec.buildId).toBe("b-1");
    expect(rec.requestedAt).toBe(at(0));
    expect(rec.steps).toHaveLength(1);
  });
});

describe("liveTimes", () => {
  test("in flight: waited = closed + open, worked = the rest", () => {
    const t = liveTimes(stateOf(parkedBuild), T0 + 180_000);
    expect(t).toEqual({
      elapsedMs: 180_000,
      openWaitMs: 60_000,
      waitingMs: 1_000 + 30_000 + 30_000 + 60_000,
      workingMs: 180_000 - 121_000,
    });
  });

  test("terminal: from the summary, independent of now", () => {
    const s = stateOf([
      requested(),
      ev(2, 100_000, { e: "completed", by: "self", summary: summary() }),
    ]);
    expect(liveTimes(s, T0 + 999_999)).toEqual({
      elapsedMs: 100_000,
      waitingMs: 1_000,
      workingMs: 99_000,
      openWaitMs: 0,
    });
  });

  test("clock skew never yields a negative duration", () => {
    const t = liveTimes(stateOf(parkedBuild), T0 - 10_000);
    expect(t.elapsedMs).toBe(0);
    expect(t.openWaitMs).toBe(0);
    expect(t.workingMs).toBe(0);
  });
});

describe("reconciliation", () => {
  test("orphanedOps: in-flight ops with identity only", () => {
    const states = foldOpLines([
      ...parkedBuild,
      requested("op-2"),
      ev(2, 1, { e: "completed", by: "self", summary: summary() }, "op-2"),
      ev(5, 1, { e: "granted" }, "headless"),
    ]);
    expect(orphanedOps(states.values()).map((s) => s.opId)).toEqual(["op-1"]);
  });

  test("the reconciler terminal closes the op as interrupted, keeping every wait", () => {
    const [orphan] = orphanedOps([stateOf(parkedBuild)]);
    const line = reconcilerCompletedEvent(orphan!, T0 + 300_000);
    expect(line.seq).toBe(11);
    const s = applyOpEvent(stateOf(parkedBuild), line);
    const rec = toOpRecord(s, T0 + 999_999)!;
    expect(rec.interrupted).toBe(true);
    expect(rec.outcome).toBe("error");
    expect(rec.closedBy).toBe("reconciler");
    expect(rec.totalMs).toBe(0);
    expect(rec.completedAt).toBeNull();
    // The open valve wait is kept, closed as aborted at the reconcile instant.
    expect(rec.waits).toHaveLength(4);
    const last = rec.waits.at(-1)!;
    expect(last.kind).toBe("duress-valve");
    expect(last.result).toBe("aborted");
    expect(last.startMs + last.durationMs).toBe(300_000);
    expect(rec.grantedAt).toBe(at(1_000));
  });
});

describe("WAIT_KINDS", () => {
  test("every wait kind has a label and a sentence", () => {
    for (const meta of Object.values(WAIT_KINDS)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.sentence(null).length).toBeGreaterThan(0);
    }
    expect(WAIT_KINDS["duress-valve"].sentence("loadRatio")).toBe(
      "held: host under duress (loadRatio)",
    );
  });
});
