import { _deployDeployments } from "./tables";
import { DeploymentSchema, type Deployment } from "../../core/schemas";

// The single row→wire projection for the endpoints: PARSED through
// `DeploymentSchema`, so the wire shape is exactly the schema's keys — the same
// projection `serveCollection` derives for the `deployments` live collection —
// and a column added to `tables.ts` reaches neither until the schema names it.
// The timestamps travel as they are: the schema's `z.coerce.date()` fields take
// the row's `Date`s.

export type DeploymentRow = typeof _deployDeployments.$inferSelect;

export function toDeployment(row: DeploymentRow): Deployment {
  return DeploymentSchema.parse(row);
}

export function toDeployments(rows: DeploymentRow[]): Deployment[] {
  return rows.map(toDeployment);
}
