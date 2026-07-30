import { _deployDeployments } from "./tables";
import type { Deployment } from "../../core/schemas";

// The single row→wire projection for this plugin, following the `servers`
// sibling: the row is spread and only the transformed columns are destructured
// out, so a column added to `tables.ts` reaches the wire as soon as
// `DeploymentSchema` names it.
//
// `defineEntity` does not apply — the timestamps are converted for the wire,
// and `defineEntity` returns rows verbatim with no hook for that.

export type DeploymentRow = typeof _deployDeployments.$inferSelect;

export function toDeployment(row: DeploymentRow): Deployment {
  const { createdAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export function toDeployments(rows: DeploymentRow[]): Deployment[] {
  return rows.map(toDeployment);
}
