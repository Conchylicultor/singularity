import { describe, expect, test } from "bun:test";
import type { OpRecord } from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import type { OpKind } from "@plugins/infra/plugins/worktree/core";
import {
  AWAIT_EXIT,
  allSettled,
  decideStates,
  exitCodeFor,
  type AwaitedOp,
  type OpState,
} from "./decide";

function record(opId: string, outcome: OpRecord["outcome"]): OpRecord {
  return {
    opId,
    kind: "check",
    opSlug: "wt",
    branch: "b",
    conversationId: null,
    lane: null,
    mode: null,
    buildId: null,
    requestedAt: "2026-09-20T00:00:00.000Z",
    grantedAt: "2026-09-20T00:00:00.000Z",
    completedAt: null,
    waits: [],
    waitMs: 0,
    holdMs: 0,
    totalMs: 0,
    outcome,
    interrupted: false,
    steps: [],
  };
}

const awaited = (op: OpKind, opId: string, pid = 111): AwaitedOp => ({
  op,
  opId,
  pid,
});
const liveMap = (entries: [OpKind, string][]) =>
  new Map(entries.map(([op, opId]) => [op, { opId }]));
const recordMap = (rs: OpRecord[]) => new Map(rs.map((r) => [r.opId, r]));
const alive = () => true;
const dead = () => false;

const one = (states: OpState[]) => states[0]!;

describe("decideStates", () => {
  test("a marker still naming our run is running", () => {
    const states = decideStates(
      [awaited("check", "a")],
      liveMap([["check", "a"]]),
      recordMap([record("a", "running")]),
      alive,
    );
    expect(one(states).kind).toBe("running");
  });

  test("a terminal record ends it, and carries the outcome", () => {
    const states = decideStates(
      [awaited("check", "a")],
      liveMap([["check", "a"]]),
      recordMap([record("a", "failed")]),
      alive,
    );
    const s = one(states);
    expect(s.kind).toBe("ended");
    expect(s.kind === "ended" && s.outcome).toBe("failed");
  });

  test("the record wins over a marker that is still there", () => {
    // The exit handler clears the marker and writes the record in that order,
    // so the two disagree for an instant. The verdict is the authority.
    const states = decideStates(
      [awaited("check", "a")],
      liveMap([["check", "a"]]),
      recordMap([record("a", "success")]),
      alive,
    );
    expect(one(states).kind).toBe("ended");
  });

  test("marker gone but the process alive is still running — the verdict is coming", () => {
    const states = decideStates(
      [awaited("check", "a")],
      liveMap([]),
      recordMap([]),
      alive,
    );
    expect(one(states).kind).toBe("running");
  });

  test("a newer op of the same kind overwrote the marker: ours still decides on its own pid", () => {
    const states = decideStates(
      [awaited("check", "a")],
      liveMap([["check", "b-is-newer"]]),
      recordMap([]),
      alive,
    );
    expect(one(states).kind).toBe("running");
  });

  test("process dead with no terminal record is vanished, never failed", () => {
    const states = decideStates(
      [awaited("check", "a", 4242)],
      liveMap([]),
      recordMap([]),
      dead,
    );
    const s = one(states);
    expect(s.kind).toBe("vanished");
    expect(s.kind === "vanished" && s.pid).toBe(4242);
  });

  test("a dead process that DID write its verdict is ended, not vanished", () => {
    const states = decideStates(
      [awaited("check", "a")],
      liveMap([]),
      recordMap([record("a", "success")]),
      dead,
    );
    expect(one(states).kind).toBe("ended");
  });
});

describe("exitCodeFor", () => {
  const ended = (outcome: "success" | "failed"): OpState => ({
    kind: "ended",
    op: "check",
    opId: "a",
    outcome,
    interrupted: false,
  });

  test("all success", () => {
    expect(exitCodeFor([ended("success")])).toBe(AWAIT_EXIT.ended);
  });

  test("any failure", () => {
    expect(exitCodeFor([ended("success"), ended("failed")])).toBe(
      AWAIT_EXIT.failed,
    );
  });

  test("a vanished op is not success", () => {
    expect(
      exitCodeFor([{ kind: "vanished", op: "check", opId: "a", pid: 1 }]),
    ).toBe(AWAIT_EXIT.failed);
  });

  test("still running has its own code, distinct from failure", () => {
    expect(exitCodeFor([{ kind: "running", op: "check", opId: "a" }])).toBe(
      AWAIT_EXIT.stillRunning,
    );
    expect(AWAIT_EXIT.stillRunning).not.toBe(AWAIT_EXIT.failed);
  });

  test("nothing awaited is its own code, distinct from success", () => {
    expect(exitCodeFor([])).toBe(AWAIT_EXIT.nothing);
    expect(AWAIT_EXIT.nothing).not.toBe(AWAIT_EXIT.ended);
  });
});

describe("allSettled", () => {
  test("false while any op runs", () => {
    expect(
      allSettled([
        {
          kind: "ended",
          op: "check",
          opId: "a",
          outcome: "success",
          interrupted: false,
        },
        { kind: "running", op: "build", opId: "b" },
      ]),
    ).toBe(false);
  });

  test("a vanished op counts as settled — nothing more will happen to it", () => {
    expect(
      allSettled([{ kind: "vanished", op: "check", opId: "a", pid: 1 }]),
    ).toBe(true);
  });
});
