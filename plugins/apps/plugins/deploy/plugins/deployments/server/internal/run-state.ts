import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  defineExternalResource,
  reportServerError,
} from "@plugins/framework/plugins/server-core/core";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  defineSupervisedRunKind,
  type UnfinishedRun,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import {
  deployRunsResource as deployRunsDescriptor,
  DeployRunSchema,
  type DeployPhase,
  type DeployRun,
} from "../../core/runs";
import type { RunDeploymentBody } from "../../core/endpoints";
import type { Deployment } from "../../core/schemas";
import { deployLog } from "./deploy-log";
import { isUniqueViolation } from "./constraint-violation";
import { DEPLOY_RUN_KIND_ID } from "./kind-id";
import {
  deliverLeg,
  isDriving,
  legRunId,
  parseLegRunId,
  type DeployLeg,
} from "./legs";
import { legStarted, readTranscriptTail } from "./transcript";
import {
  verbFailureMessage,
  verbSucceeded,
  type VerbEnding,
} from "./verb-outcome";
import { _deployRuns } from "./tables";

/** The index the claiming INSERT contends on — see `tables.ts`. */
const INFLIGHT_UQ = "deploy_runs_server_inflight_uq";

/**
 * The most recent `converge` / `ship` per deployment, in memory — the LIVE view.
 *
 * `key`/`schema` come from the shared client descriptor; an external resource is
 * the right kind because the truth lives outside Postgres — which is also why it
 * keeps a callable `notify()`, the only way to push when this Map changes.
 *
 * The durable half is `deploy_runs`, written by the same functions below.
 * Neither replaces the other: this is progress at phase granularity for a run in
 * flight, the table is every run that ever happened. See `core/runs.ts`.
 *
 * It is no longer empty after a restart. The CLI leg is detached and outlives
 * the backend, so the boot reconciler adopts it and {@link reattachRun} rebuilds
 * this entry from the ledger row — the `op-status` / `prototypes/thumbnails`
 * idiom of state that is free to rebuild at boot and impossible to leave stale.
 *
 * Bounded by construction: at most one entry per deployment row, written only
 * for a row that exists. A deleted deployment can leave a stale entry until the
 * next restart, which is invisible — every consumer reads runs *for* the
 * deployments it lists.
 */
const runs = new Map<string, DeployRun>();

export const deployRunsServerResource = defineExternalResource(
  deployRunsDescriptor,
  { mode: "push", loader: () => Object.fromEntries(runs) },
);

/** Publish the live view after any write to {@link runs}. */
function push(run: DeployRun): void {
  runs.set(run.deploymentId, run);
  deployRunsServerResource.notify();
}

/**
 * Claim a run: mint it, and INSERT its ledger row.
 *
 * **The INSERT is the lock.** The partial unique index on
 * `(launched_from, server_id) WHERE finished_at IS NULL` is what wins or loses
 * the race, so there is no check-then-act window at all — where the previous
 * shape read an in-memory Map and relied on the read and the write sitting in
 * one synchronous turn, which held only as long as nobody added an `await` and
 * evaporated entirely at every restart.
 *
 * That is also why this is now the FIRST thing a run does rather than something
 * an async body did afterwards: the row must exist, holding the lock, before the
 * CLI is spawned. A failed claim is therefore a refusal the caller sees
 * immediately (409, or a loud 500 for anything else) instead of a run that
 * appears to start and then reports that it did not.
 *
 * Takes the whole `RunDeploymentBody` rather than a loose `verb`, so the union's
 * own guarantee — `release` exists on `ship` and cannot exist on `converge` —
 * is what fills the run record, instead of a second rule about which fields go
 * together.
 */
export async function claimRun(opts: {
  deployment: Deployment;
  body: RunDeploymentBody;
}): Promise<DeployRun> {
  const { deployment, body } = opts;
  const run: DeployRun = {
    id: `drun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deploymentId: deployment.id,
    serverId: deployment.serverId,
    compositionId: deployment.compositionId,
    verb: body.verb,
    // Derived from the verb rather than passed, so "only an update has phases"
    // holds at the one place a run comes into existence — and an update is
    // never briefly phase-less between its start and its first `setRunPhase`.
    phase: body.verb === "update" ? "converge" : null,
    // Exactly what was passed as `--release`: a converge has no such flag, a
    // ship that named no run legitimately pinned nothing, and an update has not
    // resolved its bundle yet (see `setRunPhase`).
    release: body.verb === "ship" ? (body.release ?? null) : null,
    // Only knowable once a bundle resolves, which no verb has done yet.
    commitSha: null,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    message: null,
  };

  try {
    await db.insert(_deployRuns).values({
      id: run.id,
      deploymentId: run.deploymentId,
      serverId: run.serverId,
      compositionId: run.compositionId,
      verb: run.verb,
      releaseRunId: run.release,
      commitSha: run.commitSha,
      status: "running",
      startedAt: new Date(run.startedAt),
      launchedFrom: currentWorktreeName(),
      // The first leg is knowable now — an `update` always converges first — so
      // the row names a real artifact from the instant it exists, and a crash
      // between here and the spawn still leaves something the reconciler can
      // speak for.
      legRunId: legRunId(run.id, firstLeg(run.verb)),
      // This backend's own, live pid. It keeps the fresh row from looking like
      // an orphan in the window before the child's pid is known.
      pid: process.pid,
    });
  } catch (err) {
    if (isUniqueViolation(err, INFLIGHT_UQ)) throw await inFlightConflict(run);
    throw err;
  }

  push(run);
  return run;
}

/** Which leg a verb spawns first. An `update` always converges before it ships. */
function firstLeg(verb: DeployRun["verb"]): DeployLeg {
  return verb === "ship" ? "ship" : "converge";
}

/**
 * The in-flight run holding `serverId`, if any — read from the ledger, which is
 * where exclusivity actually lives now.
 *
 * This is what the in-memory `runningOnServer` Map lookup became. It had to
 * move: the Map is process state, so after a restart it answered "nothing is
 * running" about a CLI that was still running, which is precisely the thing this
 * migration exists to stop being true. It is no longer a *guard* either — the
 * claiming INSERT is (see {@link claimRun}) — so this only ever has to name the
 * winner, never decide the race.
 */
async function busyRunOnServer(serverId: string): Promise<
  | {
      deploymentId: string;
      compositionId: string;
      verb: string;
    }
  | undefined
> {
  const [busy] = await db
    .select({
      deploymentId: _deployRuns.deploymentId,
      compositionId: _deployRuns.compositionId,
      verb: _deployRuns.verb,
    })
    .from(_deployRuns)
    .where(
      and(
        eq(_deployRuns.launchedFrom, currentWorktreeName()),
        eq(_deployRuns.serverId, serverId),
        isNull(_deployRuns.finishedAt),
      ),
    );
  return busy;
}

/**
 * The 409 for a claim that lost the race, naming what is holding the server.
 *
 * The busy row is read back rather than remembered, because the winner may be
 * another process entirely. It can also have finished in the moment since the
 * violation, in which case there is nothing to name and the message says only
 * what is certain — a rare, self-correcting race that a retry resolves.
 */
async function inFlightConflict(run: DeployRun): Promise<HttpError> {
  const busy = await busyRunOnServer(run.serverId);
  if (!busy) {
    return new HttpError(
      409,
      "Another run claimed this server a moment ago and has already finished — try again.",
    );
  }
  return new HttpError(
    409,
    busy.deploymentId === run.deploymentId
      ? `The ${busy.verb} of "${busy.compositionId}" is already running on this server.`
      : `The ${busy.verb} of "${busy.compositionId}" is already running on this server — ` +
          `converge and ship both mutate host-wide state (Caddy, apt, systemd), so they run one at a time.`,
  );
}

/**
 * Record which leg this run is about to spawn — durably, before the spawn.
 *
 * The ledger row is the only thing a restarted backend has to find the child
 * with, so the leg id has to be there before the child exists. It is written for
 * the first leg too (redundantly, by the claim) rather than only when an
 * `update` moves on: one caller, one rule, and no "which legs need this" to get
 * wrong. `pid` goes back to this process's own for the same reason the claim
 * seeds it — the run has no child of its own for the moment in between.
 */
export async function beginLeg(
  run: DeployRun,
  leg: DeployLeg,
): Promise<string> {
  const legId = legRunId(run.id, leg);
  await db
    .update(_deployRuns)
    .set({ legRunId: legId, pid: process.pid })
    .where(eq(_deployRuns.id, run.id));
  return legId;
}

/**
 * Advance an in-flight `update` to its next leg, pushing the change to every
 * subscriber — the same write-then-`notify()` path {@link claimRun} and
 * {@link finishRun} use, so a phase change reaches the UI exactly like a status
 * change does.
 *
 * `release` and `commitSha` are set in the SAME write as the `ship` phase rather
 * than by a second call, because both are only known at the instant the bundle
 * resolves: one write means the record can never be observed claiming to ship
 * without naming what it is shipping.
 *
 * The ledger is deliberately NOT written here. A phase is live progress, and the
 * row's terminal stamp carries the only phase the record needs — the leg a
 * failure died on. What this write DOES reach the ledger with is the pinned run
 * id and its commit, which {@link finishRun} copies out of the live run. (Which
 * leg is *spawned* is durable, and separately — see {@link beginLeg}.)
 */
export function setRunPhase(
  deploymentId: string,
  phase: DeployPhase,
  fields?: { release?: string; commitSha?: string | null },
): void {
  const prev = runs.get(deploymentId);
  // A phase change on a run that does not exist is a bug in the sequencer, not
  // a state to tolerate — the same rule finishRun applies.
  if (!prev)
    throw new Error(`setRunPhase: no run recorded for ${deploymentId}`);
  push({
    ...prev,
    phase,
    release: fields?.release ?? prev.release,
    commitSha: fields?.commitSha ?? prev.commitSha,
  });
}

/** A terminal outcome, as the sequencer reports it. */
export interface RunOutcome {
  /**
   * Whether the run did what it was asked. Carried rather than re-derived from
   * `exitCode === 0`, and that is not tidiness: a run can end with a status of 0
   * and still not have succeeded — a SIGINT'd leg records `exitCode: 0,
   * signalCode: "INT"` (a POSIX property of asynchronous lists, see the
   * supervised-run docs), and reading the number alone would file it as a
   * success.
   */
  ok: boolean;
  /** Null when the command could not be spawned at all. */
  exitCode: number | null;
  message: string | null;
}

/**
 * Stamp a terminal outcome on both halves.
 *
 * The live view is written and pushed FIRST, then the ledger row: a deploy's
 * progress must not wait on a durability write, and the history DataView is
 * refreshed by its own `deploy.runs-revision` tick, which fires off the change
 * feed after the row commits. So neither surface can show the other's state.
 *
 * `phase` is deliberately left as it was on the live run: on a failed `update`
 * it is the leg that failed, which is the single most useful thing the record
 * can say — and it is what lands in the row's `phaseFailed`.
 *
 * The row write is first-writer-wins (`WHERE finished_at IS NULL`), because the
 * supervised-run reconciler can reach the same row from the other side — see
 * {@link closeAdoptedLeg}. It is also what releases the server's exclusivity
 * lock, since that lock IS the unfinished row.
 */
export async function finishRun(
  deploymentId: string,
  outcome: RunOutcome,
): Promise<void> {
  const prev = runs.get(deploymentId);
  // A finish with no start is a bug in the caller, not a state to tolerate.
  if (!prev) throw new Error(`finishRun: no run recorded for ${deploymentId}`);
  const status = outcome.ok ? "succeeded" : "failed";
  const finishedAt = new Date();
  push({
    ...prev,
    status,
    finishedAt: finishedAt.toISOString(),
    exitCode: outcome.exitCode,
    message: outcome.message,
  });

  await db
    .update(_deployRuns)
    .set({
      status,
      // Only a failure has a failing leg; a success ran every one of them.
      phaseFailed: status === "failed" ? prev.phase : null,
      // Copied at the end rather than on the phase write, so the row is stamped
      // once with whatever the run had actually resolved by the time it ended.
      releaseRunId: prev.release,
      commitSha: prev.commitSha,
      finishedAt,
      exitCode: outcome.exitCode,
      message: outcome.message,
    })
    .where(and(eq(_deployRuns.id, prev.id), isNull(_deployRuns.finishedAt)));
}

/**
 * The deploy plugin's supervised-run kind: the adapter between `deploy_runs` and
 * the one primitive that owns detach, pid, transcript, reconcile and re-attach.
 *
 * Mounted in `register: [...]` (see `../index.ts`) rather than started here, so
 * the kind is registered before the primitive's `onReady` reconciles — a kind
 * defined but never mounted would start runs nothing ever closes.
 *
 * The unit this names is a **leg**, not a run: an `update` is two spawns and the
 * primitive tracks each separately (see `legs.ts`). Everything below therefore
 * translates leg id ⇄ ledger row.
 */
export const deployVerbKind = defineSupervisedRunKind({
  id: DEPLOY_RUN_KIND_ID,
  channel: deployLog,
  listUnfinished,
  setPid,
  finish: finishLeg,
  onReattach: reattachRun,
});

/**
 * Every leg this namespace launched that has not been stamped with an outcome.
 *
 * **Scoped to `launched_from`, which is not optional.** A worktree DB is a fork
 * of main's and inherits its rows, so an unscoped read would hand the
 * reconciler another machine's runs — to adopt, to tail transcripts that do not
 * exist here, and to close with an outcome nobody in this namespace observed.
 *
 * Rows with no `leg_run_id` are skipped: they predate supervision, so there is
 * no artifact to read and no pid worth trusting, and inventing an outcome for
 * them would be exactly the sweep the ledger's docs refuse.
 */
async function listUnfinished(): Promise<readonly UnfinishedRun[]> {
  const rows = await db
    .select({ legRunId: _deployRuns.legRunId, pid: _deployRuns.pid })
    .from(_deployRuns)
    .where(
      and(
        eq(_deployRuns.launchedFrom, currentWorktreeName()),
        isNull(_deployRuns.finishedAt),
        isNotNull(_deployRuns.legRunId),
      ),
    );
  return rows.flatMap((row) =>
    row.legRunId === null ? [] : [{ runId: row.legRunId, pid: row.pid }],
  );
}

/** Record the pid of the detached CLI leg now serving this run. */
async function setPid(legId: string, pid: number): Promise<void> {
  await db
    .update(_deployRuns)
    .set({ pid })
    .where(eq(_deployRuns.legRunId, legId));
}

/**
 * A leg has ended. Hand it to whoever is sequencing this run — or, if nobody is,
 * close the run from the ledger alone.
 *
 * This is the only place the two cases differ, and they differ in exactly one
 * fact: whether the process that started the leg is still here. `deliverLeg`
 * answers it (see `legs.ts`), so `runUpdate` keeps its ordinary sequential
 * shape and the orphan path is the only thing that has to reason about a run it
 * did not start.
 */
async function finishLeg(legId: string, terminal: RunTerminal): Promise<void> {
  if (deliverLeg(legId, terminal)) return;
  const parsed = parseLegRunId(legId);
  if (parsed === null) {
    throw new Error(
      `[deploy] cannot close ${legId}: not a leg id — the ledger row names an ` +
        `artifact this plugin did not write.`,
    );
  }
  // A sequencer with no waiter is a sequencer between legs — an `update` in its
  // release build, which awaits in-process for tens of minutes with the row
  // legitimately open. It will stamp the run itself; closing it here would end a
  // deploy that is going perfectly well.
  if (isDriving(parsed.runId)) return;
  await closeAdoptedLeg(parsed, terminal);
}

/**
 * What an adopted leg means for the RUN it belongs to.
 *
 * A leg's outcome is not always the run's outcome, and the three arms are three
 * different things that actually happened:
 *
 * - **The leg never started.** The transcript file is created before the child
 *   is (see `legStarted`), so its absence means the backend went away between
 *   naming this leg and spawning it. Nothing was done on the host at this step,
 *   and saying "the process disappeared" about a command that never ran would
 *   send the reader looking for the wrong thing.
 * - **An `update`'s converge succeeded and the sequence was cut.** That deploy
 *   has not updated anything — stamping it `succeeded` would say the software
 *   went out when nothing was shipped. Resuming instead is not on the table:
 *   the middle leg is an in-process `runRelease` with nothing durable to resume
 *   from, so saying so and letting the user re-run is the honest option.
 * - **Anything else: the leg's own outcome is the run's.** A `converge` or a
 *   `ship` on its own, and an `update`'s final ship. This is the whole point of
 *   the migration — a run that used to be lost to any `./singularity build` now
 *   reaches its real verdict.
 */
function adoptedOutcome(
  parsed: { runId: string; leg: DeployLeg },
  legId: string,
  verb: string,
  ending: VerbEnding,
): { ok: boolean; message: string | null } {
  if (!legStarted(legId)) {
    return {
      ok: false,
      message:
        `The \`deploy ${parsed.leg}\` was never started — the backend that claimed this ` +
        `run went away before spawning it, so nothing was done on the host at this ` +
        `step. Re-run it.`,
    };
  }
  if (verb === "update" && parsed.leg === "converge" && verbSucceeded(ending)) {
    return {
      ok: false,
      message:
        `The converge finished, but the backend driving this update went away before it ` +
        `could build and ship. The host is converged and nothing was deployed — re-run ` +
        `the update.`,
    };
  }
  if (verbSucceeded(ending)) return { ok: true, message: null };
  return { ok: false, message: verbFailureMessage(ending) };
}

/**
 * Close a run whose sequencer is gone — this backend restarted while its CLI leg
 * kept going (or before it ever started), and the reconciler adopted the row.
 * {@link adoptedOutcome} decides what that means for the run.
 */
async function closeAdoptedLeg(
  parsed: { runId: string; leg: DeployLeg },
  terminal: RunTerminal,
): Promise<void> {
  const legId = legRunId(parsed.runId, parsed.leg);
  const [row] = await db
    .select()
    .from(_deployRuns)
    .where(
      and(eq(_deployRuns.id, parsed.runId), isNull(_deployRuns.finishedAt)),
    );
  // Someone stamped it first — the ordinary shape of first-writer-wins, not an
  // error.
  if (!row) return;

  const ending: VerbEnding = {
    verb: parsed.leg,
    exitCode: terminal.exitCode,
    signalCode: terminal.signalCode,
    lines: readTranscriptTail(legId),
  };
  const { ok, message } = adoptedOutcome(parsed, legId, row.verb, ending);

  const finishedAt = terminal.finishedAt;
  await db
    .update(_deployRuns)
    .set({
      status: ok ? "succeeded" : "failed",
      // Only an `update` has legs to name; a single-verb run's failing phase is
      // its verb, which the row already carries.
      phaseFailed: !ok && row.verb === "update" ? parsed.leg : null,
      finishedAt,
      exitCode: terminal.exitCode,
      message,
    })
    .where(and(eq(_deployRuns.id, row.id), isNull(_deployRuns.finishedAt)));

  const live = runs.get(row.deploymentId);
  if (live?.id === row.id) {
    push({
      ...live,
      status: ok ? "succeeded" : "failed",
      finishedAt: finishedAt.toISOString(),
      exitCode: terminal.exitCode,
      message,
    });
  }
}

/**
 * Rebuild the live view for a run this process did not start.
 *
 * The map is process memory and died with the last backend, while the child did
 * not — so without this the UI would show nothing happening beside a log that is
 * still scrolling. Rebuilt from the ledger row on every boot and never
 * persisted, which is the `op-status` / `prototypes/thumbnails` idiom: state
 * free to rebuild at boot is state that cannot go stale.
 *
 * Fire-and-forget because the primitive's `onReattach` is synchronous by design
 * — the tail is already running by the time it is called, and nothing downstream
 * waits on the live view. `finish` deliberately does not depend on this having
 * completed: it reads the row, never the map.
 *
 * ...and therefore through `runTracked`, not a bare `void`. Detached work whose
 * cost lands on no span does not merely go unattributed — at boot it VANISHES,
 * because there is no enclosing request span for it to inflate, and this runs
 * exactly there: once per adopted run, inside the supervised-run reconciler's
 * `onReady` pass. A query plus a parse per row is small until a machine comes up
 * with several open deploys, which is precisely the case nobody would think to
 * look for without a named span saying so.
 *
 * `runInBackgroundLane` / `runWithoutProfiling` would be the wrong escape: those
 * exist for observability's own writes, which must not recurse into the profiler
 * measuring them. This is ordinary domain work and belongs on the measured path.
 * A job `enqueue` would be wronger still — the thing being rebuilt is THIS
 * process's in-memory map, so work handed to a worker would rebuild nothing, and
 * it would put a durable row behind state whose whole property is being free to
 * rebuild at boot.
 *
 * **A rebuild that throws is reported and skipped, not fatal**, which is the
 * same call `reconcileSupervisedRuns` already makes one layer up: it catches per
 * KIND and again per RUN, so one corrupt marker costs exactly the run whose
 * marker is bad. `onReattach` is synchronous, so an unhandled rejection thrown
 * from inside it tunnels straight out of that isolation — one malformed
 * historical `verb` or `status` (`DeployRunSchema.parse` throws on those, by
 * design) would stop being "this run is reported and skipped" and become a
 * process-level event on every boot. Reporting here keeps the two sides
 * consistent, and puts the run id in the message so a corrupt row is
 * diagnosable without a debugger.
 *
 * That is not an exception to failing loudly. Loud means visible and
 * attributable, and a report naming the leg is strictly more of both than a
 * generic `server-unhandled` with no run on it. And what is lost when the
 * rebuild fails is one entry in a map this file's own docblock calls free to
 * rebuild at boot: the ledger row is untouched, the transcript still streams,
 * the reconciler still closes the run. The cost is a missing UI row until the
 * next boot — which is not a price worth paying anything to avoid.
 */
function reattachRun(legId: string): void {
  const parsed = parseLegRunId(legId);
  // A run this process IS sequencing already has a live entry that is ahead of
  // the row — an `update` mid-build reads `phase: "build"`, which the ledger does
  // not record. Rebuilding from the row would overwrite it with a stale phase.
  if (parsed === null || isDriving(parsed.runId)) return;
  // Labelled like the sequencer's own spans (`deploy:run` / `deploy:update`), so
  // a boot profile groups them together and names what they are.
  void runTracked("deploy:reattach-live-view", async () => {
    try {
      await loadRunIntoLiveView(legId);
    } catch (err) {
      // Deliberately not rethrown — see the docblock. Shaped like the
      // supervisor's own `reportRunFailure`, so a reattach failure and a
      // reconcile failure read the same way in the reports list.
      reportServerError({
        message:
          `[deploy] could not rebuild the live view for ${legId}: ` +
          (err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error ? (err.stack ?? null) : null,
      });
    }
  });
}

async function loadRunIntoLiveView(legId: string): Promise<void> {
  const parsed = parseLegRunId(legId);
  if (parsed === null) return;
  const [row] = await db
    .select()
    .from(_deployRuns)
    .where(eq(_deployRuns.id, parsed.runId));
  if (!row) return;
  // Parsed rather than cast: `verb` and `status` are plain `text` columns, and a
  // value outside the union must fail here rather than reach the client as a
  // shape it will render as nothing.
  push(
    DeployRunSchema.parse({
      id: row.id,
      deploymentId: row.deploymentId,
      serverId: row.serverId,
      compositionId: row.compositionId,
      verb: row.verb,
      // The leg that is running is the phase — for an `update`. A single-verb
      // run has no phases, and the verb already names its only one.
      phase: row.verb === "update" ? parsed.leg : null,
      release: row.releaseRunId,
      commitSha: row.commitSha,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      exitCode: row.exitCode,
      message: row.message,
    }),
  );
}
