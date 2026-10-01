import { serveCollection } from "@plugins/network/plugins/live/server";
import { _deployDeployments, _deployRuns } from "./tables";
import { deployments } from "../../core/resources";
import { deployRunHistory } from "../../core/runs";

// Server half of the `deployments` collection: every row field is a column of
// `deploy_deployments` by name, so the projection is exactly
// `DeploymentSchema`'s keys. The change feed drives it — a create, an edit or a
// server's cascade-delete reaches the window and the `:rows` readers with no
// hand-notify.
export const deploymentsServed = serveCollection(deployments, {
  from: _deployDeployments,
});

// Server half of the run ledger's history window: every `DeployRunRecord`
// field is a column of `deploy_runs` by name, so the projection is exactly the
// record schema's keys — the supervised-run bookkeeping (`pid`, `leg_run_id`,
// `launched_from`) never reaches the wire. No base `where`: the pane scopes a
// window to its deployment (`deploymentId`, a filterable column). The change
// feed drives it — the run ledger's writes reach the tuples holding the run.
export const deployRunHistoryServed = serveCollection(deployRunHistory, {
  from: _deployRuns,
});
