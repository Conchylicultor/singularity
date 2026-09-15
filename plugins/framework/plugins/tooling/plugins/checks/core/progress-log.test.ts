import { describe, expect, test } from "bun:test";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import type {
  StackSample,
  StackSampler,
} from "@plugins/infra/plugins/stack-sampler/core";
import {
  reconstructRuns,
  startProgressRun,
  type ProgressRecord,
} from "./progress-log";
import { STALL_MS } from "./thread-watch";

// Never the host-global sink, never the real sampler: records go to an array,
// samples come from a fake. `bun test` runs every file in one process, and the
// sampler has one owner per process — a test claim would decide whether
// health-monitor's own claim throws.
function recorder(): {
  records: ProgressRecord[];
  write: (r: ProgressRecord) => void;
} {
  const records: ProgressRecord[] = [];
  return { records, write: (r) => records.push(r) };
}

const IN_CHECK_X: StackSample = {
  timestamp: 0,
  frames: [
    {
      name: "spin",
      // Under the real repo root: the watch attributes against it by default.
      sourceURL: `${REPO_ROOT}/plugins/x/check/index.ts`,
      line: 3,
      column: 1,
      category: "JIT",
    },
  ],
};

function fakeSampler(batch: StackSample[]): StackSampler {
  return { drain: () => batch };
}

/** Hold the thread without yielding — what a stall IS. */
function block(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // spin
  }
}

describe("startProgressRun", () => {
  test("a run closed at an early exit still writes `thread`, just before `done`", () => {
    const { records, write } = recorder();
    const run = startProgressRun(
      { scope: null, requested: ["no-such-check"] },
      { write, sampler: fakeSampler([]) },
    );
    const summary = run.finish(false);
    expect(records.map((r) => r.phase)).toEqual(["run", "thread", "done"]);
    expect(summary.stallCount).toBe(0);

    const [progress] = reconstructRuns(records);
    expect(progress?.thread).toMatchObject({ stallCount: 0, stalledMs: 0 });
    expect(progress?.done?.allOk).toBe(false);
  });

  test("a block the late tick never saw is still a stall: `end.stalledMs` counts the open gap, `finish()` records it", () => {
    const { records, write } = recorder();
    const run = startProgressRun(
      { scope: null, requested: null },
      { write, sampler: fakeSampler([IN_CHECK_X]) },
    );
    run.checkStarted("x");
    const wallStart = performance.now();
    block(STALL_MS + 200);
    // Settles in the same turn the block ends — before any tick has run.
    run.checkEnded(
      "x",
      Math.round(performance.now() - wallStart),
      true,
      false,
      0,
    );
    const summary = run.finish(true);

    expect(records.map((r) => r.phase)).toEqual([
      "run",
      "start",
      "end",
      "stall",
      "thread",
      "done",
    ]);
    const end = records.find((r) => r.phase === "end");
    expect(end?.phase === "end" && end.stalledMs).toBeGreaterThanOrEqual(
      STALL_MS,
    );

    expect(summary.stallCount).toBe(1);
    expect(summary.stallOwners[0]?.owner).toBe("check x");
    const [progress] = reconstructRuns(records);
    expect(progress?.stalls).toHaveLength(1);
    expect(progress?.stalls[0]?.running).toEqual(["x"]);
    expect(progress?.thread?.stallCount).toBe(1);
    expect(progress?.completed[0]?.stalledMs).toBeGreaterThanOrEqual(STALL_MS);
  }, 10_000);
});

describe("reconstructRuns", () => {
  const base = { runId: "r1", pid: 1, worktree: "wt" };
  const at = (s: number): string =>
    new Date(Date.UTC(2026, 8, 15, 0, 0, s)).toISOString();

  test("stall / thread records reconstruct; an `end` without stalledMs reads as null, never 0", () => {
    const records: ProgressRecord[] = [
      { ...base, t: at(0), phase: "run", scope: null, requested: null },
      {
        ...base,
        t: at(1),
        phase: "selected",
        treeHash: null,
        selected: ["old", "new"],
      },
      { ...base, t: at(2), phase: "start", checkId: "old" },
      { ...base, t: at(2), phase: "start", checkId: "new" },
      // Written before the watch existed: no stalledMs, no queuedMs.
      {
        ...base,
        t: at(3),
        phase: "end",
        checkId: "old",
        durationMs: 900,
        ok: true,
        cached: false,
      },
      {
        ...base,
        t: at(9),
        phase: "stall",
        offsetMs: 1_200,
        durationMs: 7_450,
        lateMs: 7_400,
        running: ["new"],
        bootstrap: [],
        samples: 300,
        owners: [
          {
            owner: "check x",
            samples: 180,
            detail: [],
            example: ["spin @ a.ts:1"],
          },
        ],
      },
      {
        ...base,
        t: at(9),
        phase: "end",
        checkId: "new",
        durationMs: 7_600,
        ok: true,
        cached: false,
        queuedMs: 0,
        stalledMs: 7_400,
      },
      {
        ...base,
        t: at(10),
        phase: "thread",
        longestLateMs: 7_400,
        stallCount: 1,
        stalledMs: 7_400,
        samples: 420,
        rateHz: 40.3,
        selfMs: 12,
        owners: [{ owner: "check x", samples: 200, detail: [], ms: 4_963 }],
        stallOwners: [{ owner: "check x", samples: 180, detail: [] }],
      },
      { ...base, t: at(10), phase: "done", elapsedMs: 10_000, allOk: true },
    ];

    const [run] = reconstructRuns(records);
    expect(
      run?.completed.map((c) => [c.checkId, c.queuedMs, c.stalledMs]),
    ).toEqual([
      ["old", 0, null],
      ["new", 0, 7_400],
    ]);
    expect(run?.stalls).toEqual([
      {
        at: at(9),
        offsetMs: 1_200,
        durationMs: 7_450,
        lateMs: 7_400,
        running: ["new"],
        bootstrap: [],
        samples: 300,
        owners: [
          {
            owner: "check x",
            samples: 180,
            detail: [],
            example: ["spin @ a.ts:1"],
          },
        ],
      },
    ]);
    expect(run?.thread).toMatchObject({
      at: at(10),
      stallCount: 1,
      rateHz: 40.3,
    });
    expect(run?.done).toEqual({ at: at(10), elapsedMs: 10_000, allOk: true });
  });

  test("a run recorded before the watch has no thread and no stalls, not an empty summary", () => {
    const [run] = reconstructRuns([
      { ...base, t: at(0), phase: "run", scope: null, requested: null },
      { ...base, t: at(1), phase: "done", elapsedMs: 1_000, allOk: true },
    ]);
    expect(run?.thread).toBeNull();
    expect(run?.stalls).toEqual([]);
  });
});
