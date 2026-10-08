import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * The two id kinds the Deploy app's deployments mint — a deployment
 * (`deploy_deployments.id`) and one run of a verb against it
 * (`deploy_runs.id`) — declared once (`plugins/ids`). Rows minted as
 * `dpl-<ms>-<≤6>` / `drun-<ms>-<≤6>` stay recognised.
 */
export const deploymentIdKind = defineIdKind({
  prefix: "dpl",
  label: "Deployment",
});

export const deployRunIdKind = defineIdKind({
  prefix: "drun",
  label: "Deploy run",
});

export type DeploymentId = IdOf<typeof deploymentIdKind>;
export type DeployRunId = IdOf<typeof deployRunIdKind>;
