import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { startSupervisedRun } from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import { serverHealth } from "@plugins/apps/plugins/deploy/plugins/health/server";
import { runRelease } from "@plugins/release/server";
import {
  compareToHead,
  resolveBundle,
} from "@plugins/release/plugins/bundles/server";
import { bundleRefusalMessage } from "@plugins/release/plugins/bundles/core";
import { isPlatformTag, type PlatformTag } from "@plugins/release/core";
import type { Deployment } from "../../core/schemas";
import type { DeployRun } from "../../core/runs";
import type { RunDeploymentBody } from "../../core/endpoints";
import { deployLog } from "./deploy-log";
import {
  beginDriving,
  endDriving,
  legRunId,
  runLeg,
  type DeployLeg,
} from "./legs";
import { readTranscriptTail } from "./transcript";
import {
  verbFailureMessage,
  verbSucceeded,
  type VerbEnding,
} from "./verb-outcome";
import {
  beginLeg,
  claimRun,
  deployVerbKind,
  finishRun,
  setRunPhase,
  type RunOutcome,
} from "./run-state";

/** The target this app deploys. Web is the only implemented remote target. */
const RELEASE_TARGET = "web";

/**
 * Launch a verb for one deployment, streaming the CLI's output into the `deploy`
 * channel. Returns the `running` record; the outcome arrives via `deploy.runs`.
 *
 * **The claiming INSERT is the exclusivity lock**, which is why this is `await`ed
 * and why there is no check-then-act pair to keep in one synchronous turn any
 * more. The refusal is a 409 from the DB's partial unique index on
 * `(launched_from, server_id) WHERE finished_at IS NULL` (see `claimRun`), so two
 * clicks cannot both win and a restart cannot lose the lock. Scoped to the
 * SERVER, not the deployment — converge writes `/etc/caddy/Caddyfile` and runs
 * `apt-get`, so two converges on one box race even when they are different
 * compositions. An `update` holds the server for its whole sequence, which is
 * right for the same reason: both of its legs mutate host-wide state.
 */
export async function startDeployRun(opts: {
  deployment: Deployment;
  body: RunDeploymentBody;
}): Promise<DeployRun> {
  const { deployment, body } = opts;
  const run = await claimRun({ deployment, body });
  // In the same turn the claim resolves in, and before anything can await: from
  // here until `drive` stamps the run, this process owns its outcome and the
  // reconciler must leave the row alone. `drive`'s `finally` is the other half.
  beginDriving(run.id);

  if (body.verb === "update") {
    void runTracked("deploy:update", () =>
      drive(run, () => runUpdate(deployment, run)),
    );
  } else {
    void runTracked("deploy:run", () =>
      drive(run, () => runSingleVerb(deployment, run, body)),
    );
  }
  return run;
}

/**
 * Run the body, and make sure the run ends however it goes.
 *
 * The ledger row IS the server's exclusivity lock now, so an escaping exception
 * is no longer just a lost status — it would leave the row open and the server
 * held until something reconciled it. Anything the sequence did not anticipate
 * (a DB read that threw, a corrupt `RELEASE.json` — `resolveBundle` throws on
 * those by design) therefore ends the run as a failure carrying that message.
 */
async function drive(run: DeployRun, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err) {
    await failRun(run, err instanceof Error ? err.message : String(err));
  } finally {
    // Released only here — after the row has been stamped, whichever way it
    // went. Releasing earlier would hand a run that is still being sequenced to
    // the reconciler; not releasing at all would leave a finished run's id in a
    // set that only ever grows.
    endDriving(run.id);
  }
}

/** End a run at a step that spawned nothing, so there is no exit code to report. */
async function failRun(run: DeployRun, message: string): Promise<void> {
  deployLog.publish(
    `[failed] deploy ${run.verb} ${run.compositionId}: ${message}`,
    "stderr",
  );
  await finishRun(run.deploymentId, { ok: false, exitCode: null, message });
}

/**
 * `./singularity` from the checkout this backend was built from, so the CLI
 * resolves the SAME namespace: it reads its deployment record over HTTP from
 * `<worktree>.localhost:9000` and its server row from that worktree's DB fork,
 * both keyed on `currentWorktreeName()` — which the child inherits through
 * SINGULARITY_WORKTREE from this process's env (hence no env override; a
 * supervised run's `envOverrides` are additions to this backend's environment,
 * so the inheritance is unchanged by the migration).
 */
function deployArgv(
  deployment: Deployment,
  verb: DeployLeg,
  extra: readonly string[],
): string[] {
  return [
    "./singularity",
    "deploy",
    verb,
    deployment.compositionId,
    "--server",
    deployment.serverId,
    ...extra,
  ];
}

/** A `converge` or a `ship` on its own: one leg, then the terminal stamp. */
async function runSingleVerb(
  deployment: Deployment,
  run: DeployRun,
  body: Extract<RunDeploymentBody, { verb: "converge" | "ship" }>,
): Promise<void> {
  const extra =
    body.verb === "ship" && body.release ? ["--release", body.release] : [];
  const outcome = await spawnVerb(deployment, run, body.verb, extra);
  await finishRun(run.deploymentId, outcome);
}

/**
 * The one-button sequence: converge the host, build a candidate unless the
 * existing bundle is already current, then ship exactly the run id that
 * resolved.
 *
 * Nothing here re-implements a refusal. The two host-mutating legs are the same
 * CLI commands the row actions launch, and the build/no-build decision is
 * `resolveBundle` + `compareToHead` — the same authority `ship` itself consults,
 * asked one step earlier so the user does not have to. Each leg's failure ends
 * the run with that leg's own words, and `phase` is left pointing at the leg
 * that failed.
 *
 * **This function is still an ordinary sequence, and that is a deliberate
 * outcome rather than an accident of the migration.** A supervised leg's
 * outcome does not come back from the call that starts it — it arrives at the
 * kind's `finish` callback, driven by a file watcher, so the naive reading of
 * the change turns these three ordered steps into a state machine. It does not
 * need to be one: while THIS process is the one driving the run, it is also the
 * one `finish` can hand the outcome to, and `legs.ts` is the one map that says
 * so. The inversion is absorbed there, in eight lines, instead of being spread
 * through the sequence. What genuinely cannot survive a restart is the sequence
 * itself — its middle leg is an in-process `runRelease` with nothing durable to
 * resume from — and that case is handled where it actually arises, by
 * `closeAdoptedLeg`, which records an interrupted update as the failure it is
 * rather than pretending the converge's success was the update's.
 */
async function runUpdate(
  deployment: Deployment,
  run: DeployRun,
): Promise<void> {
  const composition = deployment.compositionId;

  // Read the platform BEFORE touching the host: an update that cannot resolve
  // a bundle is going to fail anyway, and failing before the converge means
  // the user reads the real reason instead of a converge log they have to
  // scroll past. Server-side off the health side-table, never from the client
  // — the platform is DISCOVERED by the probe, and a body field carrying it
  // would be a place to get it wrong.
  const health = await serverHealth.get(deployment.serverId);
  if (!health?.ok) {
    await failRun(
      run,
      "This server has no successful reachability check — run Verify connection first.",
    );
    return;
  }
  if (health.platform === null || !isPlatformTag(health.platform)) {
    await failRun(
      run,
      `This server reported platform ${health.platform ?? "unknown"}, which no release target ` +
        `builds for, so no bundle can be shipped to it.`,
    );
    return;
  }
  const platform: PlatformTag = health.platform;

  // 1. Converge. A no-op on an already-correct host (every file lands through
  //    a content-compare `put`, and the restart is gated on the running
  //    process predating its configuration), so running it before every ship
  //    costs a warm host nothing and repairs drift on a cold one.
  const converge = await spawnVerb(deployment, run, "converge", []);
  if (!converge.ok) {
    await finishRun(run.deploymentId, converge);
    return;
  }

  // Point the ledger at the ship leg BEFORE the build, not when the ship is
  // spawned. The build is the long part — often tens of minutes — and for all of
  // it the row must name a leg that has not run yet rather than the converge that
  // just finished: a row still pointing at a leg with an exit marker reads as a
  // finished run to anything that looks, and a backend that dies during the build
  // must be recoverable as "the ship never started", which is what happened.
  await beginLeg(run, "ship");

  // 2. Build — unless there is already a bundle that ship would accept AND it
  //    was cut from this exact HEAD. Anything short of `current` rebuilds: a
  //    dirty worktree is `unknown`, never `current`, so a work-in-progress
  //    tree always gets fresh bytes.
  setRunPhase(run.deploymentId, "build");
  const existing = resolveBundle({ composition, platform });
  let reuse = false;
  if (existing.ok) {
    const staleness = await compareToHead(existing.manifest, REPO_ROOT);
    reuse = staleness.kind === "current";
    // Whichever way it goes, SAY so: "why did this deploy take twelve minutes"
    // and "why did it ship something older than my tree" are the two questions
    // an automatic decision has to answer without being asked.
    deployLog.publish(
      reuse
        ? `[skip] build — ${platform} bundle ${existing.runId} is already built from the current HEAD.`
        : `[build] the ${platform} bundle ${existing.runId} is ${staleness.kind} vs HEAD — ` +
            `cutting a fresh candidate of ${composition}.`,
    );
  } else {
    deployLog.publish(
      `[build] no shippable ${platform} bundle for ${composition}: ` +
        bundleRefusalMessage(existing.refusal),
    );
  }
  if (!reuse) {
    const outcome = await runRelease({
      composition,
      target: RELEASE_TARGET,
      intent: { kind: "candidate", platform },
    });
    if (!outcome.ok) {
      await failRun(run, outcome.message);
      return;
    }
  }

  // 3. Ship, pinned by run id. Re-resolved rather than reusing `existing`: a
  //    build that just ran moved the `latest-<platform>` pointer, and the
  //    whole point of pinning is that what was resolved here is what goes out.
  const pinned = resolveBundle({ composition, platform });
  if (!pinned.ok) {
    await failRun(run, bundleRefusalMessage(pinned.refusal));
    return;
  }
  // The pinned bundle's OWN manifest is the honest answer to "which commit is
  // going onto the box" — not HEAD, which is a fact about this checkout and
  // would be a plausible lie the moment the bundle is reused or the tree moves.
  // Null when the manifest carries none (a build that predates provenance).
  setRunPhase(run.deploymentId, "ship", {
    release: pinned.runId,
    commitSha: pinned.manifest.commitSha ?? null,
  });
  await finishRun(
    run.deploymentId,
    await spawnVerb(deployment, run, "ship", ["--release", pinned.runId]),
  );
}

/**
 * Run one CLI leg to completion and report its outcome **without stamping the
 * run** — the caller decides whether this was the whole run or one leg of a
 * sequence.
 *
 * The leg is a supervised run, which is what makes it survive things it used to
 * die of. It is spawned **detached**, in its own process group: a plain child
 * shares the backend's group, and the gateway signals that whole group when it
 * hot-restarts the backend — which every `./singularity build` of this worktree
 * does. That is the entire 2026-08-28 incident, in which
 * `drun-1787890652933-wr3v6d` lost its `ship` 0.9 s after spawning it. There is
 * no pipe to read either: the child's merged output goes to a transcript file
 * that the primitive tails into the `deploy` channel, so a restart mid-leg
 * republishes it rather than losing it, and the failure message below is picked
 * from that same file — the one copy, for a leg this process started and for one
 * it merely adopted.
 *
 * The leg id is durable BEFORE the spawn (`beginLeg`), because it is the only
 * thing a restarted backend has to find the child with.
 */
async function spawnVerb(
  deployment: Deployment,
  run: DeployRun,
  verb: DeployLeg,
  extra: readonly string[],
): Promise<RunOutcome> {
  const argv = deployArgv(deployment, verb, extra);
  deployLog.publish(`$ ${argv.join(" ")}`);

  const legId = legRunId(run.id, verb);
  let terminal;
  try {
    await beginLeg(run, verb);
    terminal = await runLeg(legId, () =>
      startSupervisedRun(deployVerbKind, {
        runId: legId,
        argv,
        cwd: REPO_ROOT,
      }),
    );
  } catch (err) {
    // A spawn that never started (missing `./singularity`, EAGAIN), or a ledger
    // write that failed. Reported as a failed outcome AND a log line rather than
    // rethrown: the run record is the only place the user can see it.
    const message = err instanceof Error ? err.message : String(err);
    deployLog.publish(
      `[failed] could not run ${argv.join(" ")}: ${message}`,
      "stderr",
    );
    return { ok: false, exitCode: null, message };
  }

  const ending: VerbEnding = {
    verb,
    exitCode: terminal.exitCode,
    signalCode: terminal.signalCode,
    lines: readTranscriptTail(legId),
  };

  if (verbSucceeded(ending)) {
    deployLog.publish(`[done] deploy ${verb} ${deployment.compositionId}`);
    return { ok: true, exitCode: ending.exitCode, message: null };
  }
  const message = verbFailureMessage(ending);
  deployLog.publish(
    ending.signalCode === null
      ? `[failed] deploy ${verb} exited ${ending.exitCode}`
      : `[failed] deploy ${verb} was killed by ${ending.signalCode}`,
    "stderr",
  );
  return { ok: false, exitCode: ending.exitCode, message };
}
