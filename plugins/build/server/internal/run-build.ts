import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { startSupervisedRun } from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import { MAIN_COMPOSITION_ID } from "@plugins/infra/plugins/namespace/core";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { isMainCompositionBuild } from "@plugins/build/core";
import { buildLog } from "./build-log";
import { buildRunKind, claimBuildRun, failUnstartedBuild } from "./run-state";

// In-process re-entry guard for the START of a build, and nothing more. The
// authoritative lock is the claiming INSERT against build_runs_inflight_uniq —
// `./singularity build` restarts this very backend, so a boolean held in memory
// is wiped mid-build and the freshly-booted process would happily start a second,
// overlapping build if this were load-bearing. It is not: it only collapses two
// clicks in one process before either reaches the DB.
let inflight = false;

/**
 * Start one `./singularity build`, optionally for a set of compositions instead
 * of this checkout's own app.
 *
 * `compositions` is a SET because one invocation is one shared build — one
 * install, one codegen, one checks pass, one transcript, one `build_runs` row
 * with N chips. Rebuilding three drifted compositions is therefore one call,
 * not three queued behind each other's `.build.lock`.
 *
 * Fire-and-forget, and now fire-and-forget all the way down: this returns once
 * the child is spawned rather than once it finishes. **Everything that used to
 * happen after `await proc.exited` has moved to the supervised-run kind's
 * `finish` callback** (`run-state.ts`), because the process that held that await
 * is the one the build restarts — see that function's docblock for the
 * measurement. Nothing waits here for a build, which is why there is no waiter
 * map in this plugin the way there is in `release`.
 */
export function triggerBuild(
  trigger: "manual" | "auto",
  opts?: { compositions?: readonly string[] },
): void {
  // An empty set is a caller bug, not "build the main app": it would spawn
  // `--composition` with no ids and mint a row whose `targets` is `{}` — a run
  // that is an attempt for nothing, so no composition's termination clause could
  // ever see it. Loud here, where the caller is, rather than as a commander
  // parse error inside a detached child.
  if (opts?.compositions !== undefined && opts.compositions.length === 0) {
    throw new Error(
      "triggerBuild: `compositions` was an empty set — omit the option to build this checkout's own app.",
    );
  }
  if (inflight) return;
  inflight = true;
  // The commit this run is claimed for, stamped on the ledger row. Sampled
  // outside the async body so the row names the tree the build started on, not
  // whatever the checkout moved to while it queued. It is NOT a baseline anyone
  // carries: the convergence decision is re-derived from durable state at every
  // terminal edge (see reconcileDeployment), which is what survives this process
  // being killed by its own build.
  const forCommit = getHeadCommit();
  void runTracked("build:run", async () => {
    try {
      await doRunBuild(trigger, forCommit, opts);
    } catch (err) {
      buildLog.publish(
        `Build error: ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    } finally {
      inflight = false;
    }
  });
}

/**
 * The commit this checkout is on, stamped onto the ledger row a build claims.
 *
 * FULL sha, deliberately. `build_runs.commitHash` is compared against the dist's
 * `.build-commit` and against the checkout's HEAD — both full — to decide
 * whether a target has already been attempted, and an abbreviated form makes
 * that comparison silently always-false. Every display of the column truncates
 * at render, which is where truncation belongs.
 */
export function getHeadCommit(): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
  });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim() || null;
}

async function doRunBuild(
  trigger: "manual" | "auto",
  commitHash: string | null,
  opts?: { compositions?: readonly string[] },
): Promise<void> {
  const buildId = `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // WHAT this invocation builds, decided once and then used by the ledger row,
  // the argv and the notification alike — so the three cannot disagree about it.
  const targets = [...(opts?.compositions ?? [MAIN_COMPOSITION_ID])];

  // The claim IS the lock, and it is taken BEFORE the spawn. A trigger that lost
  // the race simply stops: auto-build is a convergence loop, so the request is
  // re-derived at the next edge rather than queued. There is no orphan sweep in
  // front of it any more — a corpse holding the slot is closed by the
  // supervised-run reconciler at boot and on its own tick while any run is live,
  // so re-deriving that here would be a second copy of an answered question.
  if (!(await claimBuildRun({ buildId, trigger, commitHash, targets }))) return;

  // `--allow-main` stays BEFORE `--composition`: commander's variadic option is
  // greedy up to the next flag, so a flag placed after it would be swallowed as
  // another composition id.
  const argv = ["./singularity", "build", "--allow-main"];
  if (!isMainCompositionBuild(targets)) argv.push("--composition", ...targets);

  try {
    await startSupervisedRun(buildRunKind, {
      runId: buildId,
      argv,
      cwd: REPO_ROOT,
      // ADDED to this backend's environment, never a replacement for it: the
      // CLI needs everything the backend was started with, plus these two.
      //
      // SINGULARITY_BUILD_DETACHED is load-bearing and must survive the
      // migration: the CLI's orphan guard exits a command whose invoking shell
      // dies, and a supervised build is MEANT to outlive the backend it
      // restarts. (It is also what keeps the build out of the admission valve's
      // background lane.)
      envOverrides: {
        SINGULARITY_BUILD_ID: buildId,
        SINGULARITY_BUILD_DETACHED: "1",
      },
    });
  } catch (err) {
    // Nothing was spawned, so no exit marker will ever land and the kind's
    // `finish` will never be called for this run. The claimed row is this
    // namespace's build lock and carries THIS backend's live pid, so the
    // reconciler would rightly leave it open forever — close it here.
    await failUnstartedBuild(
      buildId,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  if (trigger === "auto") {
    // An auto-run is no longer always a push rebuilding this checkout's own app:
    // a served composition drifting past its rate limit mints one too, and a bell
    // that said "triggered by a new push" for a weekly cadence would be a lie.
    // The distinction is `isMainCompositionBuild`, never a literal.
    const plain = isMainCompositionBuild(targets);
    await recordNotification({
      type: "build",
      title: plain ? "Auto-build started" : "Auto-rebuild started",
      description: plain
        ? `Triggered by a new push (${buildId})`
        : `Rebuilding ${targets.join(", ")} (${buildId})`,
      variant: "info",
      dedupeKey: `build-start:${buildId}`,
    });
  }
}
