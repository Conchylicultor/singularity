import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { deployRunsResource as deployRunsDescriptor, type DeployRun } from "../../core/runs";
import type { Deployment } from "../../core/schemas";

/**
 * The most recent `converge` / `ship` per deployment, in memory.
 *
 * `key`/`schema` come from the shared client descriptor; an external resource is
 * the right kind because the truth lives outside Postgres — which is also why it
 * keeps a callable `notify()`, the only way to push when this Map changes. See
 * `core/runs.ts` for why there is no table.
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
 * Record a run as started. Callers MUST have checked
 * {@link runningOnServer} in the same synchronous turn — see
 * `startDeployRun`, which is where that pairing lives.
 */
export function startRun(opts: { deployment: Deployment; verb: DeployRun["verb"] }): DeployRun {
  const run: DeployRun = {
    deploymentId: opts.deployment.id,
    serverId: opts.deployment.serverId,
    compositionId: opts.deployment.compositionId,
    verb: opts.verb,
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
 * Stamp a terminal outcome. `exitCode === 0` is the ONLY success — a `message`
 * on a failure is the CLI's own text, carried through verbatim.
 */
export function finishRun(
  deploymentId: string,
  outcome: { exitCode: number | null; message: string | null },
): void {
  const prev = runs.get(deploymentId);
  // A finish with no start is a bug in the caller, not a state to tolerate.
  if (!prev) throw new Error(`finishRun: no run recorded for ${deploymentId}`);
  runs.set(deploymentId, {
    ...prev,
    status: outcome.exitCode === 0 ? "succeeded" : "failed",
    finishedAt: new Date().toISOString(),
    exitCode: outcome.exitCode,
    message: outcome.message,
  });
  deployRunsServerResource.notify();
}
