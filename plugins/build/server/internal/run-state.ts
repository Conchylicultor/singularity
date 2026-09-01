import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import {
  defineSupervisedRunKind,
  type UnfinishedRun,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { buildDetailRoute } from "@plugins/build/core";
import {
  buildStatusOf,
  killedSignalName,
} from "@plugins/build/plugins/build-status/core";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";
import { BUILD_RUN_KIND_ID } from "@plugins/build/plugins/run-ledger/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { deploymentResource } from "@plugins/build/plugins/deployment/server";
import { reconcileDeployment } from "./reconcile";
import { buildLog } from "./build-log";

/** The index the claiming INSERT contends on — see `run-ledger`'s `tables.ts`. */
const INFLIGHT_UQ = "build_runs_inflight_uniq";

/**
 * node-postgres surfaces a unique violation as SQLSTATE 23505 plus the offending
 * constraint. The constraint is checked, not just the code: `build_runs` also has
 * a primary key, and an id collision reported as "a build is already running"
 * would be a plausible-looking lie about a different fault.
 */
function isInflightViolation(err: unknown): boolean {
  const pg = err as { code?: string; constraint?: string } | null;
  return pg?.code === "23505" && pg.constraint === INFLIGHT_UQ;
}

/**
 * Claim this namespace's single in-flight build slot by INSERTing its ledger row.
 *
 * **The INSERT is the lock.** The partial unique index on `(namespace) WHERE
 * finished_at IS NULL` is what wins or loses the race between two triggers in
 * different backend processes, where an in-process flag protects nothing. Seeded
 * with this backend's own live pid so the fresh row is not read as an orphan in
 * the window before the child's pid is known.
 *
 * The pre-flight `hasLiveInflightBuild` probe this replaces is gone: it read
 * every unfinished row and tested its pid, which is a second copy of the liveness
 * question the supervised-run reconciler now answers once — and a TOCTOU window
 * in front of the write that actually decides.
 *
 * `false` means another build holds the slot. That is an ordinary outcome, not a
 * fault: auto-build is a convergence loop, so a dropped request is re-derived at
 * the next edge rather than queued.
 */
export async function claimBuildRun(row: {
  buildId: string;
  trigger: "manual" | "auto";
  commitHash: string | null;
  targets: string[];
}): Promise<boolean> {
  try {
    await db.insert(_buildRuns).values({
      id: row.buildId,
      trigger: row.trigger,
      commitHash: row.commitHash,
      // WHAT this invocation builds, stated at the claim rather than left to the
      // column default: a serve or auto-rebuild request names its compositions,
      // a plain build names this checkout's own app. The CLI is handed the same
      // ids on argv, so the row and the process cannot disagree about what ran.
      targets: row.targets,
      pid: process.pid,
      namespace: currentWorktreeName(),
    });
    return true;
  } catch (err) {
    if (isInflightViolation(err)) return false;
    throw err;
  }
}

/**
 * Close a run that never got as far as a child — the CLI could not be spawned,
 * or a write between the claim and the spawn threw.
 *
 * It has to be closed here rather than left to the reconciler, because the
 * unfinished row IS this namespace's build lock and its seeded pid is THIS
 * backend's, which is alive: the reconciler would correctly leave it open, and
 * the lock would be held until the backend restarted. There is no exit code, and
 * none is invented — `exit_code` stays null, which `buildStatusOf` already reads
 * as `failed`, and no run that actually ran can produce it.
 *
 * No `reconcileDeployment` from here on purpose. The row is closed carrying this
 * commit, so `lastClosedAttempt` records the attempt and the convergence loop
 * will not immediately re-derive the same build — which is what stops a spawn
 * that fails every time from becoming a five-second retry loop.
 */
export async function failUnstartedBuild(
  buildId: string,
  message: string,
): Promise<void> {
  buildLog.publish(`Build error: ${message}`, "stderr");
  await db
    .update(_buildRuns)
    .set({ finishedAt: new Date() })
    .where(and(eq(_buildRuns.id, buildId), isNull(_buildRuns.finishedAt)));
}

/**
 * The build plugin's supervised-run kind: the adapter between `build_runs` and
 * the one primitive that owns detach, pid, transcript, reconcile and re-attach.
 *
 * Mounted in `register: [...]` (see `../index.ts`) rather than started here, so
 * the kind is registered before the primitive's `onReady` reconciles — a kind
 * defined but never mounted would start runs nothing ever closes.
 *
 * There is no `onReattach`: a build keeps no in-memory live view. Its UI reads
 * the ledger row plus the `build` log channel, and the primitive has already
 * restarted the transcript tail by the time `onReattach` would be called — which
 * is what makes a build's output keep scrolling across the restart the build
 * itself causes, where before it stopped dead with the pipe.
 */
export const buildRunKind = defineSupervisedRunKind({
  id: BUILD_RUN_KIND_ID,
  channel: buildLog,
  listUnfinished,
  setPid,
  finish: finishBuild,
});

/**
 * Every build this namespace launched that has not been stamped with an outcome.
 *
 * **Scoped to `namespace`, which is not optional.** A worktree DB is a fork of
 * main's and inherits its rows, so an unscoped read would hand the reconciler
 * another machine's builds — to adopt, to tail transcripts that do not exist
 * here, and to close with an outcome nobody in this namespace observed. That is
 * the phantom "Build failed" the old reconciler's own docblock warns about.
 */
async function listUnfinished(): Promise<readonly UnfinishedRun[]> {
  const rows = await db
    .select({ id: _buildRuns.id, pid: _buildRuns.pid })
    .from(_buildRuns)
    .where(
      and(
        isNull(_buildRuns.finishedAt),
        eq(_buildRuns.namespace, currentWorktreeName()),
      ),
    );
  return rows.map((row) => ({ runId: row.id, pid: row.pid }));
}

/** Record the pid of the detached `./singularity build` now serving this run. */
async function setPid(buildId: string, pid: number): Promise<void> {
  await db.update(_buildRuns).set({ pid }).where(eq(_buildRuns.id, buildId));
}

/**
 * A build has ended. THE terminal edge — the row, the bell and the convergence
 * loop, in one place, for every build however it ended and whoever is still
 * alive to see it.
 *
 * **This is the repair, and it is worth stating with the measurement that
 * motivates it.** `./singularity build` restarts the very backend that spawned
 * it, so the process holding the old `await proc.exited` was routinely killed
 * before the build finished — and everything after that await went with it. On
 * `main`: 33 `Auto-build started` bells against **2** `Build succeeded` bells
 * ever recorded. The failures that did notify are the ones that failed BEFORE the
 * deploy step, i.e. before the restart. So the notification arms below have been
 * near-dead code, and the path that actually ran — `watch-inflight-build`'s
 * `settle` — closed the row and reconciled but had no bell at all. Two
 * implementations of one edge, where the written-out one is the one that rarely
 * runs: exactly the shape this migration exists to remove.
 *
 * Now the supervisor calls this from whichever backend is alive when the exit
 * marker lands, so a build that outlives three restarts still reaches its own
 * verdict.
 *
 * Deliberately tolerant of a row the CLI already closed. The CLI's own
 * `closeRun` is the authoritative first writer (it stamps main's row right after
 * the health probe, long before the ~100s compose-serve tail), so the UPDATE
 * below is first-writer-wins and is usually a no-op — but the notification and
 * the reconcile still have to happen, and only this callback knows the build
 * ended. That is why the row is read by id rather than by `finished_at IS NULL`.
 */
async function finishBuild(
  buildId: string,
  terminal: RunTerminal,
): Promise<void> {
  await db
    .update(_buildRuns)
    .set({ finishedAt: terminal.finishedAt, exitCode: terminal.exitCode })
    .where(and(eq(_buildRuns.id, buildId), isNull(_buildRuns.finishedAt)));

  // Read back AFTER the write, so the outcome the bell describes is the one the
  // row carries — whether this process stamped it or the CLI did first.
  const [row] = await db
    .select({
      startedAt: _buildRuns.startedAt,
      finishedAt: _buildRuns.finishedAt,
      exitCode: _buildRuns.exitCode,
      commitHash: _buildRuns.commitHash,
    })
    .from(_buildRuns)
    .where(eq(_buildRuns.id, buildId));
  // No row means the ledger no longer has this build — a hand-deleted row, or a
  // retention sweep. Nothing to describe; the reconcile below still runs.
  if (row !== undefined) await notifyBuildFinished(buildId, row);

  // The dist has been republished and the ledger row is closed, so the
  // deployment description has changed on both axes it can change on.
  deploymentResource.notify();
  // The "a build reached terminal" convergence edge. It used to be written twice
  // — `triggerBuild`'s `finally` for a build whose parent survived, and
  // `watchInflightBuild`'s `settle` for one it did not — and this is the single
  // remaining copy.
  await reconcileDeployment();
}

/**
 * The bell for a finished build, in the status vocabulary the run's own badge
 * uses.
 *
 * Every arm reads `buildStatusOf`, never a raw exit code, so the notification can
 * never disagree with the badge on the run's page. Four of the six statuses are
 * not defects and must not read as alarms — `superseded` (the tree moved under
 * it), `killed` (a signal from outside says nothing about the code) and
 * `interrupted` (its process vanished without recording anything) each get their
 * own sentence.
 *
 * `RunTerminal.signalCode` is deliberately NOT consulted here, and reading the
 * status instead is not the banned `exitCode > 128` inference — but only
 * because of a precondition that has to hold and is written down where the rule
 * lives (`BUILD_EXIT_SIGNAL_BASE`): **these codes are first-party.**
 * `./singularity build` installs `installFatalSignalExit` and CHOOSES
 * `128 + signo` for itself, having caught the signal, so the number is a record
 * the build wrote rather than a wait status somebody decoded. If
 * `build_runs.exit_code` ever carries a status this repo did not author, that
 * stops being true and the shim's observed `signalCode` is what must be read.
 */
async function notifyBuildFinished(
  buildId: string,
  row: {
    startedAt: Date;
    finishedAt: Date | null;
    exitCode: number | null;
    commitHash: string | null;
  },
): Promise<void> {
  const linkTo = buildDetailRoute.link(agentManagerApp, { runId: buildId });
  const seconds = Math.round(
    ((row.finishedAt ?? new Date()).getTime() - row.startedAt.getTime()) / 1000,
  );
  const dedupeKey = `build-finish:${buildId}`;
  const status = buildStatusOf(row);
  if (status === "success") {
    await recordNotification({
      type: "build",
      title: "Build succeeded",
      description: `Completed in ${seconds}s`,
      variant: "success",
      linkTo,
      dedupeKey,
    });
    return;
  }
  if (status === "superseded") {
    // Not a failure and not an alarm: the tree moved under this build, so it had
    // nothing left to be a verdict about. The reconcile mints the rebuild.
    await recordNotification({
      type: "build",
      title: "Build superseded",
      description: `${row.commitHash?.slice(0, 9) ?? "the built commit"} was replaced mid-build — rebuilding`,
      variant: "info",
      linkTo,
      dedupeKey,
    });
    return;
  }
  // `buildStatusOf` returns `killed` only for a non-null code above the signal
  // base, so the narrowing is a restatement rather than a guard — written out
  // because `killedSignalName` takes a number and a `?? 0` default here would
  // name a signal nobody sent.
  if (status === "killed" && row.exitCode !== null) {
    // Also not a failure: a signal arrived from outside the build — a human, a
    // supervisor, another agent — which says nothing about the code.
    await recordNotification({
      type: "build",
      title: "Build ended from outside",
      description: `${killedSignalName(row.exitCode)} arrived after ${seconds}s — see the run for who sent it`,
      variant: "info",
      linkTo,
      dedupeKey,
    });
    return;
  }
  if (status === "interrupted") {
    // The supervised-run hard-kill sentinel: no exit marker at all, which only a
    // SIGKILL (or the machine going down) can produce, since every other death
    // runs the shim's trap. It never refused and never reported a failure, so it
    // is not an alarm either — but unlike `killed` there is no signal anyone
    // observed, and the sentence must not name one.
    await recordNotification({
      type: "build",
      title: "Build interrupted",
      description: `The build's process disappeared after ${seconds}s without recording an outcome`,
      variant: "info",
      linkTo,
      dedupeKey,
    });
    return;
  }
  await recordNotification({
    type: "build",
    title: "Build failed",
    description: `Exited with code ${row.exitCode} after ${seconds}s`,
    variant: "error",
    linkTo,
    dedupeKey,
  });
}
