import { liveCollection } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import { DeploymentSchema } from "./schemas";

/**
 * Every deployment, as a live collection over `deploy_deployments`: a bounded
 * window (oldest first — the order a server's list has always shown — 100 / max
 * 500) plus its `:rows` point sibling.
 *
 * - **One deployment** (the pane, its sections, the analytics gate) is
 *   `useLiveRow(deployments, deploymentId)`: a point read, so `found: false` is
 *   "this deployment no longer exists", never "outside the window".
 * - **One server's list** is `useLive(deployments, { where: { serverId } })` —
 *   `serverId` is the one filterable column, because it is the one a reader
 *   filters on.
 *
 * A deployment is one row per (composition × server), both hand-authored, so
 * the default window holds every deployment of any real server; the bound is
 * the collection's, not a promise that the set stays small.
 */
export const deployments = liveCollection("deploy.deployments", {
  row: DeploymentSchema,
  id: "id",
  filterable: { serverId: liveText() },
  sortable: ["createdAt"],
  default: { orderBy: [["createdAt", "asc"]], limit: 100 },
  maxLimit: 500,
});
