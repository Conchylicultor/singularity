/**
 * The compensating close: a claimed run whose spawn fails must not keep holding
 * its kind's in-flight lock.
 *
 * The row is claimed with `process.pid` — this backend's own, alive — so if the
 * spawn throws, the reconciler's close rule reads the row as *running* on every
 * pass until the backend restarts, and the kind's partial unique index refuses
 * every future run in the meantime. Release carried this compensation by hand as
 * `failUnstartedRelease`; it lives here so build and deploy get it too.
 */
import { describe, expect, test } from "bun:test";
import {
  HARD_KILL_EXIT_CODE,
  type RunTerminal,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import { SupervisedSpawnError } from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import { spawnClaimedRun } from "./spawn-claimed";

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test, so awaiting it
 * is an `await` of a non-Thenable — this asserts the rejection for real.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

describe("spawnClaimedRun", () => {
  test("a successful spawn touches the row not at all", async () => {
    const closed: string[] = [];

    const started = await spawnClaimedRun(
      {
        start: () => Promise.resolve({ pid: 4242 }),
        closeRow: (runId) => {
          closed.push(runId);
          return Promise.resolve();
        },
      },
      "run-ok",
    );

    expect(started).toEqual({ pid: 4242 });
    expect(closed).toEqual([]);
  });

  test("a PRE-spawn failure closes the row and rethrows the ORIGINAL error", async () => {
    const closed: { runId: string; terminal: RunTerminal }[] = [];
    const preSpawn = new SupervisedSpawnError(
      "run failed to start BEFORE its child was spawned: ENOENT",
      false,
    );

    const err = await rejection(
      spawnClaimedRun(
        {
          start: () => Promise.reject(preSpawn),
          closeRow: (runId, terminal) => {
            closed.push({ runId, terminal });
            return Promise.resolve();
          },
        },
        "run-enoent",
      ),
    );

    // The job still fails loudly — this is the wrapper's OWN failure, so it
    // earns the retry budget and the crash report.
    expect(err).toBe(preSpawn);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.runId).toBe("run-enoent");
    // The same sentinel the reconciler would stamp after a restart: no marker
    // was ever written, and none ever will be. No signal is claimed.
    expect(closed[0]?.terminal.exitCode).toBe(HARD_KILL_EXIT_CODE);
    expect(closed[0]?.terminal.signalCode).toBeNull();
  });

  test("a POST-spawn failure leaves the row in-flight for the reconciler", async () => {
    // `Bun.spawn` returned and the child is running; only the bookkeeping after
    // it failed. Closing the row here would release the kind's in-flight lock
    // under a live child, so the next enqueue would spawn a SECOND one — two
    // builds against one checkout. The child will write its own exit marker and
    // the reconciler settles it through the ordinary path.
    const closed: string[] = [];
    const postSpawn = new SupervisedSpawnError(
      "run failed to start AFTER its child was spawned: setPid write failed",
      true,
    );

    const err = await rejection(
      spawnClaimedRun(
        {
          start: () => Promise.reject(postSpawn),
          closeRow: (runId) => {
            closed.push(runId);
            return Promise.resolve();
          },
        },
        "run-after-spawn",
      ),
    );

    expect(err).toBe(postSpawn);
    expect(closed).toEqual([]);
  });

  test("an unrecognised failure is treated as 'a child may be running'", async () => {
    // Compensation requires POSITIVE proof that no child exists. A wedged kind
    // is recoverable by a restart; a duplicated build is not, so the unknown
    // case takes the recoverable side.
    const closed: string[] = [];

    const err = await rejection(
      spawnClaimedRun(
        {
          start: () => Promise.reject(new Error("something else entirely")),
          closeRow: (runId) => {
            closed.push(runId);
            return Promise.resolve();
          },
        },
        "run-unknown",
      ),
    );

    expect(err.message).toBe("something else entirely");
    expect(closed).toEqual([]);
  });

  test("a spawn failure whose close also fails reports BOTH", async () => {
    // The kind really is wedged until a restart in this case, so the message is
    // the only warning anyone gets — neither error may be swallowed by the other.
    const err = await rejection(
      spawnClaimedRun(
        {
          start: () =>
            Promise.reject(new SupervisedSpawnError("EAGAIN", false)),
          closeRow: () => Promise.reject(new Error("db is down")),
        },
        "run-both",
      ),
    );

    expect(err).toBeInstanceOf(AggregateError);
    expect(err.message).toContain("run-both");
    expect((err as AggregateError).errors.map((e: Error) => e.message)).toEqual(
      ["EAGAIN", "db is down"],
    );
  });
});
