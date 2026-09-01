import type { OpenPaneFn } from "@plugins/primitives/plugins/pane/web";
import { armText, type RunRowProps } from "@plugins/runs/web";
import { deploymentDetailPane } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { deployRunFields } from "../../core";

// Built once at module eval, not per click: each accessor validates its id and
// type against the arm's own declaration when it is built.
const serverIdOf = armText(deployRunFields, "deploy.serverId");
const deploymentIdOf = armText(deployRunFields, "deploy.deploymentId");

/**
 * Where a deploy row goes when it is clicked.
 *
 * `deploymentDetailPane` nests under the server page, so opening it needs BOTH
 * ids — which is why the whole deploy pane chain had to become route-form first:
 * the legacy segment form typed a pane's params as its own segment's only, so
 * the ancestor's `serverId` was unspellable and this could not exist.
 *
 * It lives here rather than in the barrel because a barrel may hold only
 * imports, re-exports, type aliases and the single default export — and the two
 * accessors above are top-level `const`s.
 */
export function openDeployRun(
  run: RunRowProps["run"],
  openPane: OpenPaneFn,
): void {
  const serverId = serverIdOf(run);
  const deploymentId = deploymentIdOf(run);
  // Both columns are `.notNull()` on `deploy_runs`, so this is an assertion
  // about an impossible row, not a case to handle. Throwing beats returning: a
  // click that quietly does nothing is the failure mode with no way back to the
  // cause.
  if (serverId === null || deploymentId === null) {
    throw new Error(
      `Deploy run ${run.id} is missing serverId/deploymentId — both columns are NOT NULL on deploy_runs.`,
    );
  }
  openPane(deploymentDetailPane, { serverId, deploymentId }, { mode: "push" });
}
