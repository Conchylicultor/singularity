/**
 * The spawn / wait / re-read loop, driven with a real step log, real marker
 * files and real child processes.
 *
 * The database is deliberately absent. A step is "run once per name, replay the
 * recorded result after that" and a wait is "return when something says look
 * again" — both are contracts, not machinery, so an in-memory step log exercises
 * the real algorithm while the parts that must not be faked (a marker on disk, a
 * pid in the process table) stay real. Same trade
 * `supervised-run/server/internal/supervisor.test.ts` makes for the reconciler.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";
import {
  HARD_KILL_EXIT_CODE,
  type RunTerminal,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import type { LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import { defineSupervisedRunKind } from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import {
  awaitSupervisedRun,
  superviseRuns,
  type LoopCtx,
  type StartedRunAttempt,
} from "./loop";

const worktree = currentWorktreeName();
const KIND_ID = "supjobloop";

// A stub rather than a real `defineLogSink`: nothing in this file publishes, and
// a real sink would claim a durable channel id for a test.
const channel = { publishAll: () => {} } as unknown as LogChannel;

/**
 * A REGISTERED kind, because `awaitSupervisedRun` asserts registration on the
 * way in — a kind nobody registered is one whose runs nothing reconciles and
 * whose end nothing announces, so the wait would burn its timeout forever.
 */
const kind = defineSupervisedRunKind({
  id: KIND_ID,
  channel,
  listUnfinished: () => Promise.resolve([]),
  setPid: () => Promise.resolve(),
  finish: () => Promise.resolve(),
});
// AWAITED: `Registration.register()` is declared `void | Promise<void>`, so the
// call site carries a maybe-Promise however synchronous this one is.
await kind.register();

const created: string[] = [];
const children: Bun.Subprocess[] = [];

function uniqueRunId(tag: string): string {
  return `r-${tag}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeMarker(runId: string, body: string): void {
  mkdirSync(worktreeArtifacts.runsDir(worktree), { recursive: true });
  const path = worktreeArtifacts.runTerminal(worktree, KIND_ID, runId);
  created.push(path);
  writeFileSync(path, body);
}

/** A real, long-lived child, so `isPidAlive` answers about a real process. */
function spawnLiveChild(): Bun.Subprocess {
  const proc = Bun.spawn(["sleep", "30"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  children.push(proc);
  return proc;
}

/**
 * The durable job context, in memory.
 *
 * `step` is the real contract: run `fn` the first time a name is seen, replay
 * the recorded value every time after. `waitFor` records the durable wait NAME
 * it was asked for and hands control to `onWait`, which is where a test says
 * what the world looks like by the time the handler runs again (usually: the
 * marker has landed). Driving the real `ctx.waitFor` rather than an injected
 * seam is what puts the wait-name derivation itself under test — the part most
 * likely to break under replay.
 */
function createCtx(onWait?: (name: string) => void): {
  ctx: LoopCtx;
  steps: string[];
  waits: string[];
} {
  const recorded = new Map<string, unknown>();
  const steps: string[] = [];
  const waits: string[] = [];
  return {
    steps,
    waits,
    ctx: {
      async step<R>(name: string, fn: () => Promise<R> | R): Promise<R> {
        steps.push(name);
        if (recorded.has(name)) return recorded.get(name) as R;
        const result = await fn();
        recorded.set(name, result);
        return result;
      },
      waitFor: <T extends Record<string, unknown>>(
        _event: unknown,
        opts?: { name?: string },
      ): Promise<T | null> => {
        const name = opts?.name ?? "";
        waits.push(name);
        onWait?.(name);
        // `null` is the timeout arm, and the loop must treat it exactly as it
        // treats a delivered event: go and read the marker.
        return Promise.resolve(null);
      },
    } as LoopCtx,
  };
}

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test, so awaiting it
 * is an `await` of a non-Thenable — this asserts the rejection for real. Same
 * helper the inflight / host-semaphore suites carry.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

/** Records every attempt the loop closed. */
interface EndedRecord {
  runId: string;
  attempt: number;
  exitCode: number;
  signalCode: string | null;
}

/** `finishedAt` is the marker file's mtime, so it is dropped from assertions. */
function record(
  started: StartedRunAttempt,
  terminal: RunTerminal,
  attempt: number,
): EndedRecord {
  return {
    runId: started.runId,
    attempt,
    exitCode: terminal.exitCode,
    signalCode: terminal.signalCode,
  };
}

afterEach(async () => {
  for (const proc of children.splice(0)) {
    proc.kill("SIGKILL");
    await proc.exited;
  }
  for (const path of created.splice(0)) if (existsSync(path)) rmSync(path);
});

describe("superviseRuns", () => {
  test("a lost claim is a clean return — nothing spawned, nothing ended", async () => {
    const { ctx, waits } = createCtx();
    const ended: EndedRecord[] = [];

    const result = await superviseRuns({
      kind,
      runAttempts: 1,
      ctx,
      spawn: () => Promise.resolve(null),
      onEnded: (started, terminal, attempt) => {
        ended.push(record(started, terminal, attempt));
        return Promise.resolve();
      },
    });

    expect(result).toEqual({ outcome: "not-claimed" });
    expect(ended).toEqual([]);
    // No wait was ever armed, so nothing durable outlives a job that ran nothing.
    expect(waits).toEqual([]);
  });

  test("the marker is read on the wake, and the wake's payload is never needed", async () => {
    const runId = uniqueRunId("marker");
    const proc = spawnLiveChild();
    const ended: EndedRecord[] = [];
    // What a `supervisedRun.ended` event means in practice: the marker is on
    // disk by the time the handler runs again. The event itself says nothing.
    const { ctx, waits } = createCtx(() => writeMarker(runId, "0 -\n"));

    const result = await superviseRuns({
      kind,
      runAttempts: 1,
      ctx,
      spawn: () => Promise.resolve({ runId, pid: proc.pid }),
      onEnded: (started, terminal, attempt) => {
        ended.push(record(started, terminal, attempt));
        return Promise.resolve();
      },
    });

    // The exact durable wait name, asserted as a literal: this is the spelling
    // an in-flight workflow's recorded waits are keyed by, so it may not drift.
    expect(waits).toEqual(["run-ended:1:0"]);
    expect(ended).toEqual([
      { runId, attempt: 1, exitCode: 0, signalCode: null },
    ]);
    expect(result).toEqual(
      expect.objectContaining({ outcome: "ended", runId, attempt: 1 }),
    );
  });

  test("a lost event costs one timeout, not the run", async () => {
    const runId = uniqueRunId("lost");
    const proc = spawnLiveChild();
    const ended: EndedRecord[] = [];
    let wakes = 0;
    // The first wake is the bounded wait expiring with no event ever emitted —
    // the child is still going and nothing announced anything. The loop must go
    // back to waiting rather than deciding anything.
    const { ctx, waits } = createCtx(() => {
      wakes += 1;
      if (wakes === 2) writeMarker(runId, "1 -\n");
    });

    await superviseRuns({
      kind,
      runAttempts: 1,
      ctx,
      spawn: () => Promise.resolve({ runId, pid: proc.pid }),
      onEnded: (started, terminal, attempt) => {
        ended.push(record(started, terminal, attempt));
        return Promise.resolve();
      },
    });

    expect(waits).toEqual(["run-ended:1:0", "run-ended:1:1"]);
    expect(ended).toEqual([
      { runId, attempt: 1, exitCode: 1, signalCode: null },
    ]);
  });

  test("a hard-killed child ends the run with no wake at all", async () => {
    const runId = uniqueRunId("hardkill");
    const proc = spawnLiveChild();
    proc.kill("SIGKILL");
    await proc.exited;
    const { ctx, waits } = createCtx();
    const ended: EndedRecord[] = [];

    const result = await superviseRuns({
      kind,
      runAttempts: 1,
      ctx,
      spawn: () => Promise.resolve({ runId, pid: proc.pid }),
      onEnded: (started, terminal, attempt) => {
        ended.push(record(started, terminal, attempt));
        return Promise.resolve();
      },
    });

    expect(waits).toEqual([]);
    expect(ended).toEqual([
      {
        runId,
        attempt: 1,
        exitCode: HARD_KILL_EXIT_CODE,
        // Never "KILL": nothing observed a signal, and the missing marker is the
        // only evidence there is.
        signalCode: null,
      },
    ]);
    expect(result).toEqual(
      expect.objectContaining({ outcome: "ended", attempt: 1 }),
    );
  });

  test("runAttempts: 2 respawns as a genuinely different run", async () => {
    const first = uniqueRunId("attempt1");
    const second = uniqueRunId("attempt2");
    const spawned: string[] = [];
    const { ctx, steps, waits } = createCtx();
    const ended: EndedRecord[] = [];

    const result = await superviseRuns({
      kind,
      runAttempts: 2,
      ctx,
      spawn: (attempt) => {
        const runId = attempt === 1 ? first : second;
        spawned.push(runId);
        // The marker exists before the loop looks, which is the fast-child case:
        // a run can be over before the handler ever suspends.
        writeMarker(runId, attempt === 1 ? "2 -\n" : "0 -\n");
        return Promise.resolve({ runId, pid: process.pid });
      },
      onEnded: (started, terminal, attempt) => {
        ended.push(record(started, terminal, attempt));
        return Promise.resolve();
      },
    });

    expect(spawned).toEqual([first, second]);
    expect(steps).toEqual(["spawn:1", "spawn:2"]);
    expect(waits).toEqual([]);
    // Each attempt's own row is closed before the next one claims — the kind's
    // in-flight index would refuse the second claim otherwise.
    expect(ended).toEqual([
      { runId: first, attempt: 1, exitCode: 2, signalCode: null },
      { runId: second, attempt: 2, exitCode: 0, signalCode: null },
    ]);
    expect(result).toEqual(
      expect.objectContaining({ outcome: "ended", runId: second, attempt: 2 }),
    );
  });

  test("a second attempt's waits are named apart from the first's", async () => {
    const first = uniqueRunId("waitname1");
    const second = uniqueRunId("waitname2");
    const proc = spawnLiveChild();
    // Every attempt suspends once before its marker lands, so the two attempts'
    // durable wait names must not collide — a replay walks them in order.
    const { ctx, waits } = createCtx((name) => {
      writeMarker(name.startsWith("run-ended:1") ? first : second, "1 -\n");
    });

    await superviseRuns({
      kind,
      runAttempts: 2,
      ctx,
      spawn: (attempt) =>
        Promise.resolve({
          runId: attempt === 1 ? first : second,
          pid: proc.pid,
        }),
      onEnded: () => Promise.resolve(),
    });

    expect(waits).toEqual(["run-ended:1:0", "run-ended:2:0"]);
  });

  test("a success stops the ladder: a second attempt is never spawned", async () => {
    const runId = uniqueRunId("firsttry");
    const { ctx, steps } = createCtx();
    let spawns = 0;

    await superviseRuns({
      kind,
      runAttempts: 3,
      ctx,
      spawn: () => {
        spawns += 1;
        writeMarker(runId, "0 -\n");
        return Promise.resolve({ runId, pid: process.pid });
      },
      onEnded: () => Promise.resolve(),
    });

    expect(spawns).toBe(1);
    expect(steps).toEqual(["spawn:1"]);
  });

  test("a replay does not spawn a second child for a run it already started", async () => {
    const runId = uniqueRunId("replay");
    const proc = spawnLiveChild();
    // ONE ctx across both passes — that is what a resume is: the same workflow
    // run, re-entered from the top with its recorded steps intact.
    const suspend = new Error("suspended");
    const { ctx, steps } = createCtx(() => {
      // A suspension is a throw that leaves `run`; this stands for it.
      throw suspend;
    });
    let spawns = 0;
    const ended: EndedRecord[] = [];

    const spec = {
      kind,
      runAttempts: 1,
      ctx,
      spawn: (): Promise<StartedRunAttempt> => {
        spawns += 1;
        return Promise.resolve({ runId, pid: proc.pid });
      },
      onEnded: (
        started: StartedRunAttempt,
        terminal: RunTerminal,
        attempt: number,
      ) => {
        ended.push(record(started, terminal, attempt));
        return Promise.resolve();
      },
    };

    expect((await rejection(superviseRuns(spec))).message).toBe("suspended");

    // The wake arrives: same workflow, same steps, and the marker is now there.
    writeMarker(runId, "0 -\n");
    await superviseRuns(spec);

    expect(spawns).toBe(1);
    expect(steps).toEqual(["spawn:1", "spawn:1"]);
    expect(ended).toEqual([
      { runId, attempt: 1, exitCode: 0, signalCode: null },
    ]);
  });
});

describe("awaitSupervisedRun", () => {
  test("names its waits from the caller's own prefix", async () => {
    // Deploy's legs are `converge` and `ship` in one workflow, so the prefix is
    // what keeps their durable waits apart.
    const runId = uniqueRunId("prefix");
    const proc = spawnLiveChild();
    let wakes = 0;
    const { ctx, waits } = createCtx(() => {
      wakes += 1;
      if (wakes === 2) writeMarker(runId, "0 -\n");
    });

    const terminal = await awaitSupervisedRun(ctx, {
      kind,
      runId,
      pid: proc.pid,
      name: "converge",
    });

    expect(waits).toEqual(["converge:0", "converge:1"]);
    expect(terminal.exitCode).toBe(0);
  });

  test("a marker already on disk returns without waiting", async () => {
    const runId = uniqueRunId("already");
    writeMarker(runId, "3 -\n");
    const { ctx, waits } = createCtx();

    const terminal = await awaitSupervisedRun(ctx, {
      kind,
      runId,
      pid: process.pid,
      name: "ship",
    });

    expect(waits).toEqual([]);
    expect(terminal.exitCode).toBe(3);
  });
});
