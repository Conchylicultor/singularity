import { serveCollection } from "@plugins/network/plugins/live/server";
import { _deployDeployments } from "./tables";
import { deployments } from "../../core/resources";

// Server half of the `deployments` collection: every row field is a column of
// `deploy_deployments` by name, so the projection is exactly
// `DeploymentSchema`'s keys. The change feed drives it — a create, an edit or a
// server's cascade-delete reaches the window and the `:rows` readers with no
// hand-notify.
export const deploymentsServed = serveCollection(deployments, {
  from: _deployDeployments,
});
