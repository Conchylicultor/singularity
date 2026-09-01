import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { startSupervisedRun } from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import {
  releaseOutDir,
  newReleaseRunId,
} from "@plugins/release/plugins/bundles/server";
import { releaseTargetById } from "../../core/targets";
import type { ReleaseIntent } from "../../core/endpoints";
import { collectReleaseEnv } from "./env-provider";
import { releaseLog } from "./release-log";
import { beginDriving, endDriving } from "./driving";
import {
  claimRelease,
  failUnstartedRelease,
  releaseRunKind,
  stampRelease,
  type ReleaseOutcome,
} from "./run-state";

// In-process re-entry guard only, and only for `triggerRelease`. The
// authoritative, restart-durable lock is the claiming INSERT against
// release_runs_inflight_uniq; this exists so the Studio button double-clicked in
// one process does not even reach the DB. `runRelease` is deliberately NOT
// guarded by it — a caller that legitimately awaits a release (the Deploy app's
// `update`) must not be silently dropped by a module-level boolean.
let inflight = false;

/**
 * What to cut, and why.
 *
 * An options object rather than positional args because `intent` is the
 * parameter that changes what the artifact IS (staged vs shippable), and a third
 * positional would read as an afterthought at every call site.
 */
export interface TriggerReleaseOptions {
  composition: string;
  target: string;
  /** See `ReleaseIntent` — decides `--dev` vs `--platform <tag>`, and `kind`. */
  intent: ReleaseIntent;
}

/**
 * Fire-and-forget wrapper around {@link runRelease} for the Studio button: the
 * caller gets nothing back and the outcome is observed through the log channel
 * and `release_runs`.
 */
export function triggerRelease(opts: TriggerReleaseOptions): void {
  if (inflight) return;
  inflight = true;
  void runTracked("release:run", async () => {
    try {
      await runRelease(opts);
    } catch (err) {
      releaseLog.publish(
        `Release error: ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    } finally {
      inflight = false;
    }
  });
}

/**
 * The argv difference the intent makes, and nothing else:
 *
 * - `staged`    → `--dev`, host platform. Staged only, no pointer claimed.
 * - `candidate` → NO `--dev` (it must pack, or it is not shippable) plus
 *                 `--platform <tag>` (it must be built for the host that will
 *                 run it, which is discovered, never typed).
 */
function intentArgs(intent: ReleaseIntent): string[] {
  return intent.kind === "staged" ? ["--dev"] : ["--platform", intent.platform];
}

/**
 * Cut one release and wait for it, start to finish.
 *
 * The single implementation: `triggerRelease` is `void runRelease(...)`, and the
 * Deploy app's `update` sequence awaits it between `converge` and `ship` — which
 * is the reason it is awaitable at all. Every non-success is a value here, so a
 * sequencing caller can stop with the engine's own words instead of guessing
 * from a log line.
 *
 * **It stays an ordinary awaited call even though the CLI is now a supervised
 * run**, whose outcome arrives at the kind's `finish` callback rather than from
 * the call that started it. `driving.ts` absorbs that inversion in one map: this
 * process claims the run before spawning, `finish` hands the terminal back here,
 * and only a run whose sequencer is *gone* takes the adopting path.
 *
 * There is no orphan sweep before the claim any more. The old one existed
 * because a crashed owner could leave an unfinished row that the partial unique
 * index treats as a live claim, wedging every future release of the composition;
 * the supervised-run reconciler now closes those rows at boot and on its own
 * tick while any run is live, so re-deriving that here would be a second copy of
 * a question already answered.
 */
export async function runRelease(
  opts: TriggerReleaseOptions,
): Promise<ReleaseOutcome> {
  const { composition, target, intent } = opts;
  const targetDef = releaseTargetById(target);
  // The endpoint validates the target before calling, but guard here too so a
  // direct call can't spawn the CLI with no args. Published as well as returned:
  // the log channel is where `triggerRelease`'s fire-and-forget caller — which
  // discards this value — can still see it.
  if (!targetDef?.implemented) {
    const message = `Unknown or unimplemented release target: ${target}`;
    releaseLog.publish(`Release error: ${message}`, "stderr");
    return { ok: false, reason: "unimplemented-target", runId: null, message };
  }

  // Generic, decoupled release-env injection: other plugins contribute extra env
  // vars for this target via the Release.EnvProvider slot (e.g. Apple signing
  // contributes APPLE_* for "tauri"). Collected BEFORE the claim — a contributor
  // that throws must not leave a claimed row holding the composition's lock.
  const extraEnv = await collectReleaseEnv(target);

  const releaseId = newReleaseRunId();
  const claim = await claimRelease({ releaseId, composition, target, intent });
  if (!claim.ok) return claim.outcome;

  const argv = [
    "./singularity",
    "release",
    "--composition",
    composition,
    ...targetDef.buildArgs(composition),
    ...intentArgs(intent),
    "--out",
    releaseOutDir(composition, target, releaseId),
  ];

  // Claimed BEFORE the spawn, because a CLI that refuses in milliseconds settles
  // inside `startSupervisedRun` itself — see `beginDriving`.
  const terminal = beginDriving(releaseId);
  try {
    releaseLog.publish(`$ ${argv.join(" ")}`);
    await startSupervisedRun(releaseRunKind, {
      runId: releaseId,
      argv,
      cwd: REPO_ROOT,
      // ADDED to this backend's environment, not a replacement for it: the CLI
      // needs everything the backend was started with, plus these.
      envOverrides: extraEnv,
    });
    return await stampRelease(
      { releaseId, composition, target, startedAt: claim.startedAt },
      await terminal,
    );
  } catch (err) {
    // A spawn that never started (missing `./singularity`, EAGAIN) or a ledger
    // write that failed. The row is closed here rather than left to the
    // reconciler because that unfinished row IS the composition's lock.
    const message = err instanceof Error ? err.message : String(err);
    releaseLog.publish(`Release error: ${message}`, "stderr");
    await failUnstartedRelease(releaseId, message);
    return { ok: false, reason: "failed", runId: releaseId, message };
  } finally {
    // Released only here — after the row has been stamped, whichever way it
    // went. Releasing earlier would hand a run this process is still finishing
    // to the reconciler, which would close it with the adopted wording.
    endDriving(releaseId);
  }
}
