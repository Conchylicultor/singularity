import { defineRoute } from "@plugins/primitives/plugins/pane/core";

/**
 * The Deploy app's index route. It owns no URL segment of its own — the servers
 * list IS what `/deploy` resolves to — so it contributes nothing to the path and
 * exists only to be the parent every deeper deploy route chains from.
 */
export const serversRoute = defineRoute({ id: "deploy-servers", segment: "" });

export const serverDetailRoute = defineRoute({
  id: "deploy-server-detail",
  segment: "server/:serverId",
  parent: serversRoute,
});
