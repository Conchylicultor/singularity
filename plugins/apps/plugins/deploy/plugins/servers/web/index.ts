import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { serversRootPane, addServerPane, serverDetailPane } from "./panes";
import {
  ServerItemActions,
  OpenConsoleAction,
} from "./components/server-item-actions";

export { serversRootPane, addServerPane, serverDetailPane } from "./panes";
export { serversResource } from "../shared";
export type { Server } from "../shared";

export default {
  description: "Server registry for the deployment platform.",
  contributions: [
    Pane.Register({ pane: serversRootPane }),
    Pane.Register({ pane: addServerPane }),
    Pane.Register({ pane: serverDetailPane }),
    ServerItemActions({ id: "open-console", component: OpenConsoleAction }),
  ],
} satisfies PluginDefinition;
