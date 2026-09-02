import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import {
  abortDurableRun,
  defineJob,
  isSuspendSignal,
  type JobCtx,
} from "@plugins/infra/plugins/jobs/server";
import { startSupervisedRun } from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import {
  readRunTerminal,
  type RunTerminal,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import {
  runEnded,
  type RunEndedPayload,
} from "@plugins/infra/plugins/jobs/plugins/supervised-job/server";
import { serverHealth } from "@plugins/apps/plugins/deploy/plugins/health/server";
import { awaitRelease, enqueueRelease } from "@plugins/release/server";
import {
  compareToHead,
  resolveBundle,
} from "@plugins/release/plugins/bundles/server";
import { bundleRefusalMessage } from "@plugins/release/plugins/bundles/core";
import { isPlatformTag, type PlatformTag } from "@plugins/release/core";
import type { Deployment } from "../../core/schemas";
import {
  DeployRunSchema,
  type DeployPhase,
  type DeployRun,
  type DeployVerb,
} from "../../core/runs";
import type { RunDeploymentBody } from "../../core/endpoints";
import { deployLog } from "./deploy-log";
import { DEPLOY_RUN_KIND_ID } from "./kind-id";
import { legRunId, type DeployLeg } from "./legs";
import { readTranscriptTail } from "./transcript";
import { verbSucceeded, type VerbEnding } from "./verb-outcome";
import {
  beginLeg,
  claimRun,
  deployVerbKind,
  failRun,
  setRunPhase,
} from "./run-state";
import { _deployRuns } from "./tables";

/** The target this app deploys. Web is the only implemented remote target. */
const RELEASE_TARGET = "web";

/**
 * Launch a verb for one deployment: claim the server, then hand the sequence to
 * the queue.
 *
 * **The claiming INSERT is the exclusivity lock**, and it happens HERE rather
 * than in the handler because its refusal is a 409 that has to reach the button
 * that was clicked. Scoped to the SERVER, not the deployment — converge writes
 * `/etc/caddy/Caddyfile` and runs `apt-get`, so two of them on one box race even
 * when they are different compositions. An `update` holds the server for its
 * whole sequence, which is right for the same reason: both of its legs mutate
 * host-wide state.
 */
export async function startDeployRun(opts: {
  deployment: Deployment;
  body: RunDeploymentBody;
}): Promise<DeployRun> {
  const run = await claimRun(opts);
  try {
    await deployRunJob.enqueue({ runId: run.id });
  } catch (err) {
    // The row is the server's lock, so a request that could not be queued must
    // not leave it held. Reported as a failed run AND rethrown: the caller asked
    // for a deploy and did not get one.
    await failRun(
      run.id,
      `Could not queue this deploy: ${err instanceof Error ? err.message : String(err)}`,
      "converge",
    );
    throw err;
  }
  return run;
}

const deployRunJobInput = z.object({ runId: z.string() });

/**
 * One deploy run, as a durable sequence.
 *
 * **This is the migration's whole point.** `update` is converge → build a
 * candidate → ship, and it used to be one in-process async function that
 * `await`ed a release for tens of minutes in the middle. That await is exactly
 * the window the 2026-08-28 incident died in: an unrelated `./singularity build`
 * hot-restarted the backend, the gateway signalled its process group, and
 * `drun-1787890652933-wr3v6d` lost its ship 0.9 s after spawning it. The legs
 * survived that once they became supervised runs; the SEQUENCE between them did
 * not, which is why an adopted converge used to be recorded as "the update was
 * interrupted".
 *
 * Now every step of the sequence is a `ctx.step` and every gap is a
 * `ctx.waitFor`, so the handler returns through the jobs plugin's suspend
 * sentinel and comes back as a fresh dispatch — in whichever backend is alive by
 * then. Nothing holds a worker slot while a leg or a release runs, and there is
 * no in-memory map of who is sequencing what, because the question no longer
 * exists.
 *
 * `hold` is **`seconds`**, not `instant` and not `minutes`. The spawns here are
 * detached and suspended on, so they bound nothing; what does bound a dispatch
 * is one `git` read (`compareToHead`, behind the shared heavy-read pool) plus a
 * handful of indexed queries. `instant` would be a claim of no blocking I/O
 * that a `git` invocation makes false; `minutes` would spend one of only four
 * slots that can serve genuinely long work on a handler that runs for
 * milliseconds. If the work here ever does exceed the class ceiling, the
 * slot-hog report names the real defect.
 *
 * `maxAttempts` is the default. A retry re-enters the handler, replays the
 * memoized steps and finds the run already closed (see {@link loadOpenRun}), so
 * a failure that stamped its run cannot re-run it against the host.
 */
export const deployRunJob = defineJob({
  name: "deploy.run",
  hold: "seconds",
  input: deployRunJobInput,
  event: z.never(),
  // A fresh workflow id per enqueue. The claim is what prevents overlap, and a
  // `singleton` key would let one failed run's cached steps and resolved waits
  // be replayed by the next — the trap `supervised-job` documents.
  dedup: "none",
  run: ({ input, ctx }) => runDeploy(input.runId, ctx),
});

/** The ledger facts the sequence runs on. Immutable for the life of the run. */
interface OpenRun {
  id: string;
  verb: DeployVerb;
  compositionId: string;
  serverId: string;
  releaseRunId: string | null;
}

/**
 * The run this workflow is for, or null when it is already over.
 *
 * Read on every dispatch rather than carried in the input, so a resumed sequence
 * cannot act on a stale copy — and so a run that something else has already
 * closed (the reconciler stamping a hard-killed leg; a retry after a failure
 * that stamped its own run) stops here instead of spawning against a host the
 * record says is done with.
 */
async function loadOpenRun(runId: string): Promise<OpenRun | null> {
  const [row] = await db
    .select()
    .from(_deployRuns)
    .where(eq(_deployRuns.id, runId));
  if (!row) {
    throw new Error(`[deploy] no run row for ${runId} — nothing to sequence.`);
  }
  if (row.finishedAt !== null) return null;
  return {
    id: row.id,
    // Parsed rather than cast: a `verb` outside the union would otherwise reach
    // `finalLeg` and decide, silently, that this run has no last leg.
    verb: DeployRunSchema.shape.verb.parse(row.verb),
    compositionId: row.compositionId,
    serverId: row.serverId,
    releaseRunId: row.releaseRunId,
  };
}

async function runDeploy(runId: string, ctx: JobCtx): Promise<void> {
  const run = await loadOpenRun(runId);
  if (run === null) return;

  // The phase a failure would be attributed to, advanced as the sequence moves.
  // A single-verb run has no phases and `publishLiveRun` drops it; it is carried
  // anyway so the catch-all below has one honest answer for every verb.
  let phase: DeployPhase = run.verb === "ship" ? "ship" : "converge";
  try {
    if (run.verb === "update") {
      await runUpdate(run, ctx, (next) => {
        phase = next;
      });
    } else {
      await runLeg(run, ctx, run.verb, shipArgs(run));
    }
  } catch (err) {
    // `ctx.waitFor` returns from the handler by THROWING a suspend sentinel, so
    // it must reach the worker untouched — catching it here would hang the
    // workflow forever.
    if (isSuspendSignal(err)) throw err;
    // The row is the server's exclusivity lock, so an escaping exception is not
    // just a lost status: it would hold that server until something reconciled
    // it. Stamped AND rethrown — the run gets its verdict, and the job still
    // fails loudly and earns its report. A retry then finds the run closed and
    // returns.
    await failRun(
      run.id,
      err instanceof Error ? err.message : String(err),
      phase,
    );
    throw err;
  }

  // The sequence is over and its outcome recorded, so nothing should resume this
  // workflow again. That is not automatic: an iteration a wait loop skipped (the
  // marker appeared on a replay before the wait it had armed was consulted)
  // leaves a pending wait row with a timeout scheduled behind it.
  await abortDurableRun(ctx.workflowRunId);
}

/** `--release <runId>` for a `ship` that pinned one; nothing for anything else. */
function shipArgs(run: OpenRun): readonly string[] {
  return run.verb === "ship" && run.releaseRunId !== null
    ? ["--release", run.releaseRunId]
    : [];
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
 * the run with that leg's own words (written by the kind's `closeRow`, not from
 * here), and `phase` is left pointing at the leg that failed.
 */
async function runUpdate(
  run: OpenRun,
  ctx: JobCtx,
  setPhase: (phase: DeployPhase) => void,
): Promise<void> {
  await setRunPhase(run.id, "converge");

  // Read the platform BEFORE touching the host: an update that cannot resolve a
  // bundle is going to fail anyway, and failing before the converge means the
  // user reads the real reason instead of a converge log they have to scroll
  // past. Server-side off the health side-table, never from the client — the
  // platform is DISCOVERED by the probe, and a body field carrying it would be a
  // place to get it wrong.
  const platform = await ctx.step("platform", () => resolvePlatform(run));
  if (!platform.ok) {
    await failRun(run.id, platform.message, "converge");
    return;
  }

  // 1. Converge. A no-op on an already-correct host (every file lands through a
  //    content-compare `put`, and the restart is gated on the running process
  //    predating its configuration), so running it before every ship costs a
  //    warm host nothing and repairs drift on a cold one.
  const converge = await runLeg(run, ctx, "converge", []);
  if (!converge.ok) return;

  // Point the ledger at the ship leg BEFORE the build, not when the ship is
  // spawned. The build is the long part — often tens of minutes — and for all of
  // it the row must name a leg that has not run yet rather than the converge
  // that just finished: a row still pointing at a leg with an exit marker reads
  // as a finished run to anything that looks. `listUnfinished` skips a leg with
  // no transcript, so naming an unspawned leg does not offer it to the
  // reconciler to close.
  if (!(await ctx.step("begin-ship", () => beginLeg(run.id, "ship")))) return;

  setPhase("build");
  await setRunPhase(run.id, "build");

  // 2. Build — unless there is already a bundle that ship would accept AND it
  //    was cut from this exact HEAD. Anything short of `current` rebuilds: a
  //    dirty worktree is `unknown`, never `current`, so a work-in-progress tree
  //    always gets fresh bytes.
  const decision = await ctx.step("bundle-decision", () =>
    decideBuild(run.compositionId, platform.platform),
  );
  if (decision.build) {
    // Enqueued in a step so a resume cannot request a second release, and the id
    // is minted by `enqueueRelease` so this workflow can name the run it is
    // about to wait for. The wait itself is `release`'s — it knows its own kind
    // id, its ledger, and what a run that was never claimed means.
    const releaseId = await ctx.step("enqueue-release", () =>
      enqueueRelease({
        composition: run.compositionId,
        target: RELEASE_TARGET,
        intent: { kind: "candidate", platform: platform.platform },
      }),
    );
    const released = await awaitRelease(ctx, {
      releaseId,
      composition: run.compositionId,
      name: "release",
    });
    if (!released.ok) {
      await failRun(run.id, released.message, "build");
      return;
    }
  }

  // 3. Ship, pinned by run id. Re-resolved rather than reusing the bundle the
  //    decision above looked at: a build that just ran moved the
  //    `latest-<platform>` pointer, and the whole point of pinning is that what
  //    was resolved HERE is what goes out.
  const pinned = await ctx.step("pin-bundle", () =>
    pinBundle(run.compositionId, platform.platform),
  );
  if (!pinned.ok) {
    await failRun(run.id, pinned.message, "build");
    return;
  }
  setPhase("ship");
  await setRunPhase(run.id, "ship");
  await runLeg(run, ctx, "ship", ["--release", pinned.runId], {
    release: pinned.runId,
    commitSha: pinned.commitSha,
  });
}

/**
 * `./singularity` from the checkout this backend was built from, so the CLI
 * resolves the SAME namespace: it reads its deployment record over HTTP from
 * `<worktree>.localhost:9000` and its server row from that worktree's DB fork,
 * both keyed on `currentWorktreeName()` — which the child inherits through
 * SINGULARITY_WORKTREE from this process's env (hence no env override; a
 * supervised run's `envOverrides` are additions to this backend's environment).
 */
function deployArgv(
  run: OpenRun,
  verb: DeployLeg,
  extra: readonly string[],
): string[] {
  return [
    "./singularity",
    "deploy",
    verb,
    run.compositionId,
    "--server",
    run.serverId,
    ...extra,
  ];
}

/** What one leg did, as far as the SEQUENCE is concerned. */
interface LegResult {
  /** Did this leg do what it was asked? `false` also covers "it never ran". */
  readonly ok: boolean;
}

/**
 * Spawn one CLI leg, suspend until it ends, and say whether it succeeded —
 * **without stamping the run**.
 *
 * The stamp is the kind's `closeRow`, in the supervised-run reconciler, and that
 * split is the durability: a leg's outcome is recorded from its own exit marker
 * by whichever backend sees it end, whether or not this workflow is still alive
 * to notice. What happens here is only what the sequence needs — is there more
 * to do?
 *
 * The leg is spawned **detached**, in its own process group, because a plain
 * child shares the backend's group and the gateway signals that whole group when
 * it hot-restarts a backend. The spawn sits inside a memoized step, so a resume
 * re-attaches to the child it already started rather than starting a second one.
 */
async function runLeg(
  run: OpenRun,
  ctx: JobCtx,
  leg: DeployLeg,
  extra: readonly string[],
  pin?: { release: string; commitSha: string | null },
): Promise<LegResult> {
  const legId = legRunId(run.id, leg);
  const spawned = await ctx.step(`spawn:${leg}`, () =>
    spawnLeg(run, leg, extra, pin),
  );
  if (spawned.state === "run-closed") return { ok: false };
  if (spawned.state === "failed") {
    await failRun(
      run.id,
      `could not run \`deploy ${leg}\`: ${spawned.message}`,
      leg,
    );
    return { ok: false };
  }

  // Stable per position in this workflow, so a resume re-walks the same durable
  // wait names. A run has at most one leg of each kind.
  const observed = await awaitLeg(run.id, legId, ctx, leg);
  // Something already closed the whole run — a hard-killed leg the reconciler
  // stamped, or a `failRun` on a retried attempt. There is nothing left to
  // sequence and nothing to say about it that the row does not already carry.
  if (observed.state === "run-closed") return { ok: false };

  // Memoized, so a resume that re-walks the sequence does not re-announce a leg
  // that ended twenty minutes ago — every wake of the release wait replays this
  // path, and a `[done] deploy converge` per wake would be six of them on one
  // build. It also means the transcript tail is read once rather than per wake.
  return ctx.step(`ended:${leg}`, () =>
    announceLeg(run, leg, legId, observed.terminal),
  );
}

/** Say how a leg ended on the `deploy` channel, and answer the sequence. */
function announceLeg(
  run: OpenRun,
  leg: DeployLeg,
  legId: string,
  terminal: RunTerminal,
): LegResult {
  const ending: VerbEnding = {
    verb: leg,
    exitCode: terminal.exitCode,
    signalCode: terminal.signalCode,
    lines: readTranscriptTail(legId),
  };
  if (verbSucceeded(ending)) {
    deployLog.publish(`[done] deploy ${leg} ${run.compositionId}`);
    return { ok: true };
  }
  deployLog.publish(
    ending.signalCode === null
      ? `[failed] deploy ${leg} exited ${ending.exitCode}`
      : `[failed] deploy ${leg} was killed by ${ending.signalCode}`,
    "stderr",
  );
  return { ok: false };
}

/**
 * How long one suspension waits for a leg's `supervisedRun.ended` before waking
 * anyway.
 *
 * The same five minutes `supervised-job` uses, and for the same reason: the
 * event is a wake-up, the artifacts are the authority, and a bounded re-look
 * costs a lost event one interval instead of the whole deploy.
 */
const LEG_WAIT_MS = 5 * 60 * 1000;

/** Where one leg stands, according to the two things that cannot lie. */
type LegObservation =
  | { readonly state: "running" }
  | { readonly state: "ended"; readonly terminal: RunTerminal }
  /** Something already closed the whole run — the sequence is over. */
  | { readonly state: "run-closed" };

/**
 * Wait until this leg has ended, or until the run it belongs to is over.
 *
 * **The pid never enters this reasoning, and that is deliberate.** The close
 * rule `supervised-job` applies — marker present ⇒ ended, no marker with a dead
 * pid ⇒ hard kill — lives in the supervised-run reconciler, which reaches this
 * leg through `listUnfinished` and stamps the row through the kind's
 * `closeRow`. So the SIGKILL case the pid arm exists for arrives here as a
 * closed ledger row, and there is no second copy of the rule to keep in step
 * with the first. What is left is two facts, both of them files or rows nobody
 * has to interpret: the leg's exit marker, and whether the run is still open.
 *
 * **Observe before waiting.** `startSupervisedRun` settles a run whose marker is
 * already on disk by the time the spawn returns, so its announcement can fire
 * while this handler is still inside its spawn step with no trigger armed. A
 * wait-first loop would hang until its timeout on a leg that was over before it
 * started.
 */
async function awaitLeg(
  runId: string,
  legId: string,
  ctx: JobCtx,
  name: string,
): Promise<Exclude<LegObservation, { state: "running" }>> {
  for (let iteration = 0; ; iteration++) {
    const observation = await observeLeg(runId, legId);
    if (observation.state !== "running") return observation;
    // The payload is discarded, deliberately — this is a wake-up. `null` (the
    // timeout arm) and an event are the same instruction: go and look.
    await ctx.waitFor<RunEndedPayload>(runEnded, {
      where: { kindId: DEPLOY_RUN_KIND_ID, runId: legId },
      timeoutMs: LEG_WAIT_MS,
      name: `${name}:${iteration}`,
    });
  }
}

async function observeLeg(
  runId: string,
  legId: string,
): Promise<LegObservation> {
  const terminal = readRunTerminal(DEPLOY_RUN_KIND_ID, legId);
  if (terminal !== null) return { state: "ended", terminal };
  const [row] = await db
    .select({ finishedAt: _deployRuns.finishedAt })
    .from(_deployRuns)
    .where(eq(_deployRuns.id, runId));
  if (!row || row.finishedAt !== null) return { state: "run-closed" };
  return { state: "running" };
}

type SpawnResult =
  | { readonly state: "spawned" }
  /** The run was closed under us — nothing was spawned and nothing should be. */
  | { readonly state: "run-closed" }
  | { readonly state: "failed"; readonly message: string };

/**
 * Name the leg durably, then spawn it. Runs inside a memoized step.
 *
 * A spawn that never started (missing `./singularity`, EAGAIN) is returned as a
 * VALUE rather than thrown: a step that throws is cached as a permanent failure
 * and replays its error forever, so the run would never get its verdict.
 */
async function spawnLeg(
  run: OpenRun,
  leg: DeployLeg,
  extra: readonly string[],
  pin?: { release: string; commitSha: string | null },
): Promise<SpawnResult> {
  const argv = deployArgv(run, leg, extra);
  // The leg id is durable BEFORE the spawn, because it is the only thing a
  // restarted backend has to find the child with — and the write refuses if the
  // run has been closed in the meantime.
  if (!(await beginLeg(run.id, leg, pin))) return { state: "run-closed" };
  deployLog.publish(`$ ${argv.join(" ")}`);
  try {
    // The pid is recorded on the row by the kind's `setPid`, which is where the
    // reconciler reads it. The sequence does not need it: it waits on the exit
    // marker and on the row, never on the process table (see `awaitLeg`).
    await startSupervisedRun(deployVerbKind, {
      runId: legRunId(run.id, leg),
      argv,
      cwd: REPO_ROOT,
    });
    return { state: "spawned" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deployLog.publish(
      `[failed] could not run ${argv.join(" ")}: ${message}`,
      "stderr",
    );
    return { state: "failed", message };
  }
}

type PlatformResult =
  | { readonly ok: true; readonly platform: PlatformTag }
  | { readonly ok: false; readonly message: string };

async function resolvePlatform(run: OpenRun): Promise<PlatformResult> {
  const health = await serverHealth.get(run.serverId);
  if (!health?.ok) {
    return {
      ok: false,
      message:
        "This server has no successful reachability check — run Verify connection first.",
    };
  }
  if (health.platform === null || !isPlatformTag(health.platform)) {
    return {
      ok: false,
      message:
        `This server reported platform ${health.platform ?? "unknown"}, which no release target ` +
        `builds for, so no bundle can be shipped to it.`,
    };
  }
  return { ok: true, platform: health.platform };
}

/**
 * Is there already a bundle `ship` would accept, cut from this exact HEAD?
 *
 * Whichever way it goes, SAY so: "why did this deploy take twelve minutes" and
 * "why did it ship something older than my tree" are the two questions an
 * automatic decision has to answer without being asked. The lines are published
 * from inside the step, so a resume does not repeat them.
 */
async function decideBuild(
  composition: string,
  platform: PlatformTag,
): Promise<{ build: boolean }> {
  const existing = resolveBundle({ composition, platform });
  if (!existing.ok) {
    deployLog.publish(
      `[build] no shippable ${platform} bundle for ${composition}: ` +
        bundleRefusalMessage(existing.refusal),
    );
    return { build: true };
  }
  const staleness = await compareToHead(existing.manifest, REPO_ROOT);
  const reuse = staleness.kind === "current";
  deployLog.publish(
    reuse
      ? `[skip] build — ${platform} bundle ${existing.runId} is already built from the current HEAD.`
      : `[build] the ${platform} bundle ${existing.runId} is ${staleness.kind} vs HEAD — ` +
          `cutting a fresh candidate of ${composition}.`,
  );
  return { build: !reuse };
}

type PinResult =
  | {
      readonly ok: true;
      readonly runId: string;
      /**
       * The pinned bundle's OWN manifest is the honest answer to "which commit
       * is going onto the box" — not HEAD, which is a fact about this checkout
       * and would be a plausible lie the moment the bundle is reused or the tree
       * moves. Null when the manifest carries none (a build predating
       * provenance).
       */
      readonly commitSha: string | null;
    }
  | { readonly ok: false; readonly message: string };

function pinBundle(composition: string, platform: PlatformTag): PinResult {
  const pinned = resolveBundle({ composition, platform });
  if (!pinned.ok) {
    return { ok: false, message: bundleRefusalMessage(pinned.refusal) };
  }
  return {
    ok: true,
    runId: pinned.runId,
    commitSha: pinned.manifest.commitSha ?? null,
  };
}
