import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  deployRunsResource as deployRunsDescriptor,
  type DeployPhase,
  type DeployRun,
} from "../../core/runs";
import type { RunDeploymentBody } from "../../core/endpoints";
import type { Deployment } from "../../core/schemas";
import { _deployRuns } from "./tables";

/**
 * The most recent `converge` / `ship` per deployment, in memory — the LIVE view.
 *
 * `key`/`schema` come from the shared client descriptor; an external resource is
 * the right kind because the truth lives outside Postgres — which is also why it
 * keeps a callable `notify()`, the only way to push when this Map changes.
 *
 * The durable half is `deploy_runs`, written by the same two functions below.
 * Neither replaces the other: this is progress at phase granularity for the run
 * this process is driving, the table is every run that ever happened. See
 * `core/runs.ts`.
 *
 * Bounded by construction: at most one entry per deployment row, written only
 * for a row that exists. A deleted deployment can leave a stale entry until the
 * next restart, which is invisible — every consumer reads runs *for* the
 * deployments it lists.
 */
const runs = new Map<string, DeployRun>();

export const deployRunsServerResource = defineExternalResource(deployRunsDescriptor, {
  mode: "push",
  loader: () => Object.fromEntries(runs),
});

/** The in-flight run on `serverId`, if any — regardless of which deployment. */
export function runningOnServer(serverId: string): DeployRun | undefined {
  for (const run of runs.values()) {
    if (run.status === "running" && run.serverId === serverId) return run;
  }
  return undefined;
}

/**
 * Claim a run as started. Callers MUST have checked
 * {@link runningOnServer} in the same synchronous turn — see
 * `startDeployRun`, which is where that pairing lives.
 *
 * **Synchronous on purpose, which is why it does not write the ledger row.** An
 * `await` between "nothing is running on this server" and "mark it running" is a
 * TOCTOU window two clicks walk straight through, and an INSERT cannot join a
 * synchronous turn. So the claim happens here and the opening row is written by
 * {@link recordRunStarted}, which the caller awaits as the first thing its async
 * run body does — see `run-deploy.ts`.
 *
 * Takes the whole `RunDeploymentBody` rather than a loose `verb`, so the union's
 * own guarantee — `release` exists on `ship` and cannot exist on `converge` —
 * is what fills the run record, instead of a second rule about which fields go
 * together.
 */
export function startRun(opts: { deployment: Deployment; body: RunDeploymentBody }): DeployRun {
  const { body } = opts;
  const run: DeployRun = {
    id: `drun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deploymentId: opts.deployment.id,
    serverId: opts.deployment.serverId,
    compositionId: opts.deployment.compositionId,
    verb: body.verb,
    // Derived from the verb rather than passed, so "only an update has phases"
    // holds at the one place a run comes into existence — and an update is
    // never briefly phase-less between its start and its first `setRunPhase`.
    phase: body.verb === "update" ? "converge" : null,
    // Exactly what was passed as `--release`: a converge has no such flag, a
    // ship that named no run legitimately pinned nothing, and an update has not
    // resolved its bundle yet (see `setRunPhase`).
    release: body.verb === "ship" ? body.release ?? null : null,
    // Only knowable once a bundle resolves, which no verb has done yet.
    commitSha: null,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    message: null,
  };
  runs.set(run.deploymentId, run);
  deployRunsServerResource.notify();
  return run;
}

/**
 * Open this run's ledger row — the durable half of {@link startRun}'s claim.
 *
 * Written as `running` rather than only at the end, so a run that is in flight
 * (or one whose backend died mid-flight) is in the record too. The alternative —
 * insert the finished row once — would make "the box was mid-deploy when the
 * machine went down" indistinguishable from "nothing was ever deployed", which
 * is the exact question this ledger exists to answer.
 *
 * Throws on a failed write. The caller ends the run with that failure rather
 * than deploying unrecorded: see `run-deploy.ts`.
 */
export async function recordRunStarted(run: DeployRun): Promise<void> {
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
  });
}

/**
 * Advance an in-flight `update` to its next leg, pushing the change to every
 * subscriber — the same write-then-`notify()` path {@link startRun} and
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
 * id and its commit, which {@link finishRun} copies out of the live run.
 */
export function setRunPhase(
  deploymentId: string,
  phase: DeployPhase,
  fields?: { release?: string; commitSha?: string | null },
): void {
  const prev = runs.get(deploymentId);
  // A phase change on a run that does not exist is a bug in the sequencer, not
  // a state to tolerate — the same rule finishRun applies.
  if (!prev) throw new Error(`setRunPhase: no run recorded for ${deploymentId}`);
  runs.set(deploymentId, {
    ...prev,
    phase,
    release: fields?.release ?? prev.release,
    commitSha: fields?.commitSha ?? prev.commitSha,
  });
  deployRunsServerResource.notify();
}

/**
 * Stamp a terminal outcome on both halves. `exitCode === 0` is the ONLY success
 * — a `message` on a failure is the CLI's own text, carried through verbatim.
 *
 * The live view is written and pushed FIRST, then the ledger row: a deploy's
 * progress must not wait on a durability write, and the history DataView is
 * refreshed by its own `deploy.runs-revision` tick, which fires off the change
 * feed after the row commits. So neither surface can show the other's state.
 *
 * `phase` is deliberately left as it was on the live run: on a failed `update`
 * it is the leg that failed, which is the single most useful thing the record
 * can say — and it is what lands in the row's `phaseFailed`.
 */
export async function finishRun(
  deploymentId: string,
  outcome: { exitCode: number | null; message: string | null },
): Promise<void> {
  const prev = runs.get(deploymentId);
  // A finish with no start is a bug in the caller, not a state to tolerate.
  if (!prev) throw new Error(`finishRun: no run recorded for ${deploymentId}`);
  const status = outcome.exitCode === 0 ? "succeeded" : "failed";
  const finishedAt = new Date();
  runs.set(deploymentId, {
    ...prev,
    status,
    finishedAt: finishedAt.toISOString(),
    exitCode: outcome.exitCode,
    message: outcome.message,
  });
  deployRunsServerResource.notify();

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
    .where(eq(_deployRuns.id, prev.id));
}
