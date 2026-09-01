/**
 * The regression guard for one broken contract: **a run whose ledger row is
 * stamped before its process ends must keep its tail and must still receive
 * `finish`.**
 *
 * This is not a build quirk, which is why it is tested here rather than through
 * a consumer. A kind whose own CLI closes its row does so while the child is
 * still running — `./singularity build` closes its row after the health probe
 * and then runs for another ~100s of compose-serve tail (measured: 75.8s). The
 * reconciler used to drop such a run from the live set on the ledger's say-so,
 * which stopped the tail mid-run (truncating the live log for EVERY kind that
 * stamps early) and, once it was the last live run, tore down the watcher — so
 * the exit marker landed with nobody listening and `finish` was never called at
 * all.
 *
 * Driven through the real `reconcileSupervisedRuns` with a fake ledger and real
 * child processes, because the bug is in how the loop COMPOSES: the per-row
 * decision (`readRunTerminal` + `isPidAlive`) was already right and is already
 * covered in `core/internal/terminal.test.ts`. What broke was a second loop that
 * bypassed it.
 *
 * One thing to know when reading the assertions: a tail is PUMPED by watcher
 * events and by its own final drain, never by `reconcileSupervisedRuns` itself.
 * So the channel is asserted on after the run settles, where the drain has
 * flushed everything the tail was still holding — which is also the sharper
 * test, since a tail stopped early publishes nothing at all afterwards.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/server";
import type { LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import type { RunTerminal } from "../../core";
import { defineSupervisedRunKind, type UnfinishedRun } from "./registry";
import { reconcileSupervisedRuns } from "./supervisor";

const worktree = currentWorktreeName();

/**
 * One fake kind for this file. The id is a filename prefix, so it obeys
 * `assertRunKindId` (lowercase alphanumeric, no separator) and is distinct from
 * every real kind's, so its artifacts share no prune family with them.
 */
const KIND_ID = "suptest";

/** What the fake ledger currently answers, rewritten per step of a test. */
let ledger: UnfinishedRun[] = [];
/** Every `finish` this kind received, in order. */
let finished: { runId: string; terminal: RunTerminal }[] = [];
/** Every line the tail published into the channel. */
let published: string[] = [];

// A stub rather than a real `defineLogSink`: the supervisor only ever calls
// `publishAll`, and a real sink would claim a durable channel id for a test.
const channel = {
  publishAll: (items: readonly { line: string }[]) => {
    for (const item of items) published.push(item.line);
  },
} as unknown as LogChannel;

const kind = defineSupervisedRunKind({
  id: KIND_ID,
  channel,
  listUnfinished: () => Promise.resolve(ledger),
  setPid: () => Promise.resolve(),
  finish: (runId, terminal) => {
    finished.push({ runId, terminal });
    return Promise.resolve();
  },
});
// AWAITED, not `void`-ed: `Registration.register()` is declared
// `void | Promise<void>` (server-core `types.ts`), so the call site carries a
// maybe-Promise however synchronous this particular implementation is. `void`
// would assert fire-and-forget, and that would be a lie — nothing else
// registers this kind, and every test below drives the real reconciler, which
// iterates the registry. `define-retention.test.ts` awaits its `register()` for
// the same reason.
await kind.register();

const created: string[] = [];
const children: Bun.Subprocess[] = [];

function appendTranscript(runId: string, text: string): void {
  mkdirSync(worktreeArtifacts.runsDir(worktree), { recursive: true });
  const path = worktreeArtifacts.runTranscript(worktree, KIND_ID, runId);
  if (!created.includes(path)) created.push(path);
  appendFileSync(path, text);
}

function writeMarker(runId: string, body: string): void {
  const path = worktreeArtifacts.runTerminal(worktree, KIND_ID, runId);
  if (!created.includes(path)) created.push(path);
  appendFileSync(path, body);
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

function uniqueRunId(tag: string): string {
  return `r-${tag}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

afterEach(async () => {
  // Kill and REAP every child, then reconcile against an empty ledger, so the
  // supervisor's own watcher is torn down rather than outliving the test file.
  // Awaiting `exited` is what reaps: `isPidAlive` succeeds on a zombie, so an
  // unreaped child would read as alive and leave a run tracked forever.
  ledger = [];
  for (const proc of children.splice(0)) {
    proc.kill("SIGKILL");
    await proc.exited;
  }
  await reconcileSupervisedRuns();
  for (const path of created.splice(0)) {
    if (existsSync(path)) rmSync(path);
  }
  finished = [];
  published = [];
});

describe("reconcileSupervisedRuns: a run the ledger stopped listing", () => {
  test("keeps tailing after the drop, and is finished only when the marker lands", async () => {
    const runId = uniqueRunId("alive");
    const proc = spawnLiveChild();
    appendTranscript(runId, "before the row was stamped\n");
    ledger = [{ runId, pid: proc.pid }];
    await reconcileSupervisedRuns();

    // The caller's own CLI stamps its row — the run leaves the unfinished set
    // while its process keeps going.
    ledger = [];
    await reconcileSupervisedRuns();
    expect(finished).toEqual([]);

    // More output, and another pass. Still not finished: no marker, live pid.
    appendTranscript(runId, "after the row was stamped\n");
    await reconcileSupervisedRuns();
    expect(finished).toEqual([]);

    // The child exits; the shim writes the marker. NOW it finishes.
    writeMarker(runId, "0 -\n");
    await reconcileSupervisedRuns();

    // Asserted by membership rather than by count: a watcher is live for most of
    // this test (the run is tracked), so the same marker can also reach
    // `settleFromMarker` through a debounced filesystem event. That the run is
    // finished AT ALL is the regression; how many edges noticed is not.
    const own = finished.filter((f) => f.runId === runId);
    expect(own.length).toBeGreaterThan(0);
    expect(own[0]?.terminal.exitCode).toBe(0);
    expect(own[0]?.terminal.signalCode).toBeNull();

    // BOTH halves of the transcript reach the channel — including everything
    // written after the ledger stopped naming the run. This is the part that is
    // not build-specific: under the old bare `untrack` the tail was stopped at
    // the drop, so the second line was never published by anything, ever.
    expect(published).toEqual([
      "before the row was stamped",
      "after the row was stamped",
    ]);
  });

  test("is finished with the hard-kill sentinel when its child dies leaving no marker", async () => {
    const runId = uniqueRunId("sigkill");
    const proc = spawnLiveChild();
    appendTranscript(runId, "half a run\n");
    ledger = [{ runId, pid: proc.pid }];
    await reconcileSupervisedRuns();

    ledger = [];
    proc.kill("SIGKILL");
    // Reaped, so the subsequent probe answers about a dead pid rather than a
    // zombie — `process.kill(pid, 0)` succeeds on either.
    await proc.exited;
    children.splice(children.indexOf(proc), 1);
    await reconcileSupervisedRuns();

    const own = finished.filter((f) => f.runId === runId);
    expect(own).toHaveLength(1);
    // A status no child can produce, with no signal claimed — SIGKILL runs no
    // shell, so absence is the only evidence there is.
    expect(own[0]?.terminal.exitCode).toBe(-1);
    expect(own[0]?.terminal.signalCode).toBeNull();
  });

  test("is finished exactly once, not again on every later pass", async () => {
    // No watcher is ever armed here: the marker is already present, so the very
    // first pass settles the run and the live set is empty by the time
    // `syncWatcher` looks. That makes the count deterministic, which is what
    // lets this test pin "exactly once" where the one above cannot.
    const runId = uniqueRunId("once");
    appendTranscript(runId, "quick\n");
    writeMarker(runId, "7 -\n");
    ledger = [{ runId, pid: null }];
    await reconcileSupervisedRuns();
    expect(finished).toHaveLength(1);
    expect(finished[0]?.terminal.exitCode).toBe(7);

    ledger = [];
    await reconcileSupervisedRuns();
    await reconcileSupervisedRuns();
    expect(finished).toHaveLength(1);
  });
});
