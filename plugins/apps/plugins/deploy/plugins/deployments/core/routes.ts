import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { serverDetailRoute } from "@plugins/apps/plugins/deploy/plugins/servers/core";

/**
 * One deployment, under the server it lives on.
 *
 * Segments are GLOBALLY unique across all panes after param-name erasure —
 * `d/:sha` is the diff pane's, so a deployment uses `dep/…`.
 *
 * Chaining to `serverDetailRoute` is what types the pane's params as the full
 * `{ serverId, deploymentId }`, so a caller with no route context — a row in the
 * merged runs list — can open this pane from anywhere.
 */
export const deploymentDetailRoute = defineRoute({
  id: "deploy-deployment-detail",
  segment: "dep/:deploymentId",
  parent: serverDetailRoute,
});
