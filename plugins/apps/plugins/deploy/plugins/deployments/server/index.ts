import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleList } from "./internal/handle-list";
import { handleGet } from "./internal/handle-get";
import { handleCreate } from "./internal/handle-create";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import { handleRun } from "./internal/handle-run";
import { deploymentsServerResource } from "./internal/resources";
import { deployRunsServerResource } from "./internal/run-state";
import {
  listDeployments,
  createDeployment,
  getDeployment,
  updateDeployment,
  deleteDeployment,
  runDeployment,
} from "../core/endpoints";

export { _deployDeployments } from "./internal/tables";
export { deploymentsServerResource } from "./internal/resources";

export default {
  description:
    "Owns the deploy_deployments table: where a composition is served and under what URL ((composition × server) → { hostnames, loopbackPort }), its push live resource, and the CRUD endpoints. Also launches `./singularity deploy converge|ship` for a deployment, streaming the CLI's output into the durable `deploy` log channel and its outcome into the in-memory `deploy.runs` resource. The install itself — run user, dir layout, systemd unit, Caddy site — is derived in core/, never stored.",
  httpRoutes: {
    [listDeployments.route]: handleList,
    [createDeployment.route]: handleCreate,
    [getDeployment.route]: handleGet,
    [updateDeployment.route]: handleUpdate,
    [deleteDeployment.route]: handleDelete,
    [runDeployment.route]: handleRun,
  },
  contributions: [
    Resource.Declare(deploymentsServerResource),
    Resource.Declare(deployRunsServerResource),
  ],
} satisfies ServerPluginDefinition;
