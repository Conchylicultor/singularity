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
 * ids, and both are spelled here: a pane's params are its route's CHAINED set,
 * so the ancestor's `serverId` is nameable even though this row is nowhere near
 * the server page. An open never discards a param the caller supplied — a
 * relative open materializes any declared ancestor the route does not already
 * hold and whose params the caller named — so `serverId` is what puts
 * `server/<id>` in the URL from all three of this row's hosts (the build
 * button's popover, and inside the build and backup panes). Trimming it to the
 * pane's own id strands the pane without its ancestor.
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
