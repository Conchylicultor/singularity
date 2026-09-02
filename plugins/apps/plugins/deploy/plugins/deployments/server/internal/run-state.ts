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
import { runEnded } from "@plugins/infra/plugins/jobs/plugins/supervised-job/server";
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
  finalLeg,
  firstLeg,
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
 * The most recent `converge` / `ship` / `update` per deployment, in memory — the
 * LIVE view.
 *
 * `key`/`schema` come from the shared client descriptor; an external resource is
 * the right kind because the truth lives outside Postgres — which is also why it
 * keeps a callable `notify()`, the only way to push when this Map changes.
 *
 * The durable half is `deploy_runs`, written by the same functions below.
 * Neither replaces the other: this is progress at phase granularity for a run in
 * flight, the table is every run that ever happened. See `core/runs.ts`.
 *
 * **Every entry is DERIVED from the ledger row** ({@link publishLiveRun}) rather
 * than accumulated, which is what lets a run's sequencer resume in a process
 * that has never seen it: the phase is the one thing the row does not carry, and
 * it is passed in by whoever knows it. Bounded by construction — at most one
 * entry per deployment row, written only for a row that exists.
 */
const runs = new Map<string, DeployRun>();

export const deployRunsServerResource = defineExternalResource(
  deployRunsDescriptor,
  { mode: "push", loader: () => Object.fromEntries(runs) },
);

/**
 * Rebuild one run's live-view entry from its ledger row and publish it.
 *
 * The ONE way `runs` is written. Everything the UI shows about a run except its
 * live phase is on the row, so deriving rather than mutating removes the whole
 * class of "the map is ahead of / behind the table" bug — and, more importantly,
 * removes the requirement that the process pushing a phase change be the one
 * that started the run. A resumed `update` is routinely in a different backend.
 *
 * `phase` is the caller's own knowledge and is applied only to an `update`: a
 * single-verb run's verb already names its only phase, so "only an update has
 * phases" is enforced here rather than at each call site.
 */
async function publishLiveRun(
  runId: string,
  phase: DeployPhase,
): Promise<DeployRun> {
  const [row] = await db
    .select()
    .from(_deployRuns)
    .where(eq(_deployRuns.id, runId));
  if (!row) throw new Error(`[deploy] no run row for ${runId}`);
  // Parsed rather than cast: `verb` and `status` are plain `text` columns, and a
  // value outside the union must fail here rather than reach the client as a
  // shape it will render as nothing.
  const run = DeployRunSchema.parse({
    id: row.id,
    deploymentId: row.deploymentId,
    serverId: row.serverId,
    compositionId: row.compositionId,
    verb: row.verb,
    phase: row.verb === "update" ? phase : null,
    release: row.releaseRunId,
    commitSha: row.commitSha,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    exitCode: row.exitCode,
    message: row.message,
  });
  runs.set(run.deploymentId, run);
  deployRunsServerResource.notify();
  return run;
}

/**
 * Claim a run: mint it, INSERT its ledger row, and publish the live view.
 *
 * **The INSERT is the lock.** The partial unique index on
 * `(launched_from, server_id) WHERE finished_at IS NULL` is what wins or loses
 * the race, so there is no check-then-act window at all. A failed claim is a
 * refusal the caller sees immediately (409, or a loud 500 for anything else)
 * instead of a run that appears to start and then reports that it did not.
 *
 * It runs in the ENDPOINT rather than in the job, deliberately: the 409 has to
 * reach the button that was clicked, and a claim taken inside a queued handler
 * would answer minutes later on a request that had already returned 200.
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
  const id = `drun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await db.insert(_deployRuns).values({
      id,
      deploymentId: deployment.id,
      serverId: deployment.serverId,
      compositionId: deployment.compositionId,
      verb: body.verb,
      // Exactly what was passed as `--release`: a converge has no such flag, a
      // ship that named no run legitimately pinned nothing, and an update has
      // not resolved its bundle yet — `beginLeg` writes it when the ship leg is
      // spawned.
      releaseRunId: body.verb === "ship" ? (body.release ?? null) : null,
      // Only knowable once a bundle resolves, which no verb has done yet.
      commitSha: null,
      status: "running",
      startedAt: new Date(),
      launchedFrom: currentWorktreeName(),
      // The first leg is knowable now — an `update` always converges first — so
      // the row names a real artifact from the instant it exists.
      legRunId: legRunId(id, firstLeg(body.verb)),
      // This backend's own, live pid. It keeps the fresh row from looking like
      // an orphan in the window before the child's pid is known.
      pid: process.pid,
    });
  } catch (err) {
    if (isUniqueViolation(err, INFLIGHT_UQ)) {
      throw await inFlightConflict(deployment);
    }
    throw err;
  }
  return publishLiveRun(id, "converge");
}

/**
 * The in-flight run holding `serverId`, if any — read from the ledger, which is
 * where exclusivity actually lives.
 *
 * Not a *guard* — the claiming INSERT is (see {@link claimRun}) — so this only
 * ever has to name the winner, never decide the race.
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
async function inFlightConflict(deployment: Deployment): Promise<HttpError> {
  const busy = await busyRunOnServer(deployment.serverId);
  if (!busy) {
    return new HttpError(
      409,
      "Another run claimed this server a moment ago and has already finished — try again.",
    );
  }
  return new HttpError(
    409,
    busy.deploymentId === deployment.id
      ? `The ${busy.verb} of "${busy.compositionId}" is already running on this server.`
      : `The ${busy.verb} of "${busy.compositionId}" is already running on this server — ` +
          `converge and ship both mutate host-wide state (Caddy, apt, systemd), so they run one at a time.`,
  );
}

/**
 * Record which leg this run is about to spawn — durably, before the spawn — and
 * say whether the run is still open to receive it.
 *
 * The ledger row is the only thing a restarted backend has to find the child
 * with, so the leg id has to be there before the child exists.
 *
 * **`WHERE finished_at IS NULL`, and the answer is used.** A resumed workflow
 * can reach this after something else has already closed its run (the
 * reconciler stamping a hard-killed leg, most of all), and spawning then would
 * put a live child behind a finished row — a deploy nobody is watching, against
 * a host the record says is done with. `false` means stop.
 *
 * `fields` carries the pinned bundle when there is one, written in the SAME
 * statement as the leg pointer so the row can never be observed about to ship
 * without naming what it is shipping.
 */
export async function beginLeg(
  runId: string,
  leg: DeployLeg,
  fields?: { release: string; commitSha: string | null },
): Promise<boolean> {
  const updated = await db
    .update(_deployRuns)
    .set({
      legRunId: legRunId(runId, leg),
      pid: process.pid,
      ...(fields === undefined
        ? {}
        : { releaseRunId: fields.release, commitSha: fields.commitSha }),
    })
    .where(and(eq(_deployRuns.id, runId), isNull(_deployRuns.finishedAt)))
    .returning({ id: _deployRuns.id });
  return updated.length > 0;
}

/**
 * Advance an in-flight `update` to its next phase in the live view.
 *
 * The ledger is deliberately NOT written here: a phase is live progress, and the
 * row's terminal stamp carries the only phase the record needs — the leg a
 * failure died on. (Which leg is *spawned* is durable, and separately — see
 * {@link beginLeg}.)
 */
export async function setRunPhase(
  runId: string,
  phase: DeployPhase,
): Promise<void> {
  await publishLiveRun(runId, phase);
}

/**
 * End a run at a step that spawned nothing, so there is no exit code to report.
 *
 * This is the sequencer's own terminal write, and it covers exactly the
 * failures that are not a leg's: an unreachable server, a platform no target
 * builds for, a release that refused or failed, a bundle that will not resolve.
 * A LEG's outcome is never stamped here — {@link closeDeployRow} owns those, in
 * the reconciler, so they are recorded whether or not this workflow survives.
 *
 * First-writer-wins, because the reconciler can reach the same row.
 */
export async function failRun(
  runId: string,
  message: string,
  phase: DeployPhase,
): Promise<void> {
  const [row] = await db
    .select({
      verb: _deployRuns.verb,
      compositionId: _deployRuns.compositionId,
      finishedAt: _deployRuns.finishedAt,
    })
    .from(_deployRuns)
    .where(eq(_deployRuns.id, runId));
  if (!row || row.finishedAt !== null) return;
  const verb = DeployRunSchema.shape.verb.parse(row.verb);

  const updated = await db
    .update(_deployRuns)
    .set({
      status: "failed",
      // Only an `update` has legs to name; a single-verb run's failing phase is
      // its verb, which the row already carries.
      phaseFailed: verb === "update" ? phase : null,
      finishedAt: new Date(),
      exitCode: null,
      message,
    })
    .where(and(eq(_deployRuns.id, runId), isNull(_deployRuns.finishedAt)))
    .returning({ id: _deployRuns.id });
  if (updated.length === 0) return;

  deployLog.publish(
    `[failed] deploy ${verb} ${row.compositionId}: ${message}`,
    "stderr",
  );
  await publishLiveRun(runId, phase);
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
 *
 * `finish` is close-then-announce, the same two arms `defineSupervisedJob` gives
 * a kind it owns. Deploy builds them by hand because it is the one consumer
 * whose job owns SEVERAL sequential runs — converge, a release, ship — which is
 * a shape `defineSupervisedJob`'s one-claim-one-spawn contract cannot express.
 * The rules are still that plugin's: the close is a bare, idempotent,
 * first-writer-wins write that runs in every backend, and it happens BEFORE the
 * announcement so a failing emit still leaves a closed row.
 */
export const deployVerbKind = defineSupervisedRunKind({
  id: DEPLOY_RUN_KIND_ID,
  channel: deployLog,
  listUnfinished,
  setPid,
  finish: async (legId, terminal) => {
    await closeDeployRow(legId, terminal);
    await runEnded.emit({ kindId: DEPLOY_RUN_KIND_ID, runId: legId });
  },
  onReattach: reattachRun,
});

/**
 * Every leg this namespace has actually SPAWNED that has not been stamped with
 * an outcome.
 *
 * **Scoped to `launched_from`, which is not optional.** A worktree DB is a fork
 * of main's and inherits its rows, so an unscoped read would hand the
 * reconciler another machine's runs — to adopt, to tail transcripts that do not
 * exist here, and to close with an outcome nobody in this namespace observed.
 *
 * **Filtered on the leg having started, which is also not optional.** The row
 * names its next leg BEFORE that leg is spawned — an `update` points at `ship`
 * for the whole length of its release build, which is tens of minutes with no
 * child of its own and this backend's pid on the row. Report that leg and the
 * close rule reads it as a run whose process disappeared the moment this backend
 * restarts, and closes a deploy that is going perfectly well. `legStarted` is
 * the crisp signal: the primitive creates the transcript file before it spawns,
 * and nothing else creates it, so a leg with no file has no child to reconcile.
 *
 * Rows with no `leg_run_id` are skipped: they predate supervision, so there is
 * no artifact to read and no pid worth trusting.
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
    row.legRunId !== null && legStarted(row.legRunId)
      ? [{ runId: row.legRunId, pid: row.pid }]
      : [],
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
 * Stamp the RUN's terminal outcome from the leg that just ended — unless the
 * sequence has more to do.
 *
 * This is the kind's `closeRow`: a bare, idempotent, first-writer-wins write
 * that runs in the supervised-run reconciler of whichever backend sees the leg
 * end, including one that knows nothing about the workflow driving the run. It
 * is the reason a deploy's outcome is recorded even when its workflow dies, and
 * it is why the ledger no longer needs an in-memory "is somebody sequencing
 * this?" flag.
 *
 * **One leg is not always one run, and the rule for that is a pure function of
 * the row.** An `update`'s converge that SUCCEEDED leaves the run open — the
 * build and the ship are still to come, and the workflow will resume to run
 * them, in this backend or the next. Every other ending is the run's: a failed
 * leg always ends the run, and a successful final leg ends it too.
 *
 * The previous shape had a third arm here — "an update's converge succeeded and
 * the sequence was cut, so record the run as an interrupted failure". It is
 * gone because the thing it described cannot happen any more: the sequence was
 * an in-process `await runRelease(...)` with nothing durable to resume from, and
 * it is a suspended workflow now.
 */
async function closeDeployRow(
  legId: string,
  terminal: RunTerminal,
): Promise<void> {
  const parsed = parseLegRunId(legId);
  if (parsed === null) {
    throw new Error(
      `[deploy] cannot close ${legId}: not a leg id — the ledger row names an ` +
        `artifact this plugin did not write.`,
    );
  }
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
  const ok = verbSucceeded(ending);
  const verb = DeployRunSchema.shape.verb.parse(row.verb);
  // More legs to come: this run is not over.
  if (ok && parsed.leg !== finalLeg(verb)) return;

  await db
    .update(_deployRuns)
    .set({
      status: ok ? "succeeded" : "failed",
      // Only an `update` has legs to name; a single-verb run's failing phase is
      // its verb, which the row already carries.
      phaseFailed: !ok && verb === "update" ? parsed.leg : null,
      finishedAt: terminal.finishedAt,
      exitCode: terminal.exitCode,
      message: ok ? null : verbFailureMessage(ending),
    })
    .where(and(eq(_deployRuns.id, row.id), isNull(_deployRuns.finishedAt)));

  await publishLiveRun(row.id, parsed.leg);
}

/**
 * Rebuild the live view for a leg this process did not start.
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
 * `onReady` pass.
 *
 * **A rebuild that throws is reported and skipped, not fatal**, which is the
 * same call `reconcileSupervisedRuns` already makes one layer up: it catches per
 * KIND and again per RUN, so one corrupt marker costs exactly the run whose
 * marker is bad. `onReattach` is synchronous, so an unhandled rejection thrown
 * from inside it would tunnel straight out of that isolation — one malformed
 * historical `verb` or `status` (`DeployRunSchema.parse` throws on those, by
 * design) would stop being "this run is reported and skipped" and become a
 * process-level event on every boot. What is lost when the rebuild fails is one
 * entry in a map this file's own docblock calls free to rebuild at boot.
 */
function reattachRun(legId: string): void {
  const parsed = parseLegRunId(legId);
  if (parsed === null) return;
  // Labelled like the sequencer's own spans, so a boot profile groups them
  // together and names what they are.
  void runTracked("deploy:reattach-live-view", async () => {
    try {
      // The leg that is running is the phase — for an `update`. A single-verb
      // run has no phases, and `publishLiveRun` drops the argument for it.
      await publishLiveRun(parsed.runId, parsed.leg);
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

/**
 * Rebuild the live view for every open run of this namespace, at boot.
 *
 * `onReattach` covers the runs with a LIVE leg, because that is what the
 * supervised-run reconciler adopts. It cannot cover the one case this migration
 * created: an `update` sitting in its release build has no leg of its own —
 * the sequence is a suspended workflow, and the workflow only resumes when the
 * release ends or its wait times out. Without this the deployment would show
 * nothing happening for up to that interval after every backend restart, which
 * is precisely the restart an `update` now survives.
 *
 * The phase is DERIVED from the row rather than remembered: a named leg with no
 * transcript has not spawned (`legStarted`), and for an `update` the only leg
 * that is named-but-unspawned is `ship` — which is the build. So the reader gets
 * "Building" rather than a ship that has not started.
 */
export async function reconcileDeployLiveView(): Promise<void> {
  const rows = await db
    .select({ id: _deployRuns.id, legRunId: _deployRuns.legRunId })
    .from(_deployRuns)
    .where(
      and(
        eq(_deployRuns.launchedFrom, currentWorktreeName()),
        isNull(_deployRuns.finishedAt),
      ),
    );
  for (const row of rows) {
    // Per row: a corrupt one costs its own entry, not every other run's.
    try {
      await publishLiveRun(row.id, phaseOfOpenRow(row.legRunId));
    } catch (err) {
      reportServerError({
        message:
          `[deploy] could not rebuild the live view for ${row.id}: ` +
          (err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error ? (err.stack ?? null) : null,
      });
    }
  }
}

/** Which phase an open row is in, from the leg it names and whether it ran. */
function phaseOfOpenRow(legId: string | null): DeployPhase {
  if (legId === null) return "converge";
  const parsed = parseLegRunId(legId);
  if (parsed === null) return "converge";
  if (parsed.leg === "ship" && !legStarted(legId)) return "build";
  return parsed.leg;
}
