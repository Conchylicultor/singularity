import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { serversRootPane, addServerPane, serverDetailPane } from "./panes";

export { serversRootPane, addServerPane, serverDetailPane } from "./panes";
export { serversResource } from "../shared";
export type { Server } from "../shared";

export default {
  id: "deploy-servers",
  name: "Deploy: Servers",
  description: "Server registry for the deployment platform.",
  contributions: [
    Pane.Register({ pane: serversRootPane }),
    Pane.Register({ pane: addServerPane }),
    Pane.Register({ pane: serverDetailPane }),
  ],
} satisfies PluginDefinition;
