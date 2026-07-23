import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { serversRootPane, serverDetailPane } from "./panes";
import {
  ServerItemActions,
  OpenConsoleAction,
} from "./components/server-item-actions";

export { serversRootPane, serverDetailPane, NEW_SERVER_ID } from "./panes";
export { serversResource } from "../shared";
export type { Server } from "../shared";

export default {
  description: "Server registry for the deployment platform.",
  contributions: [
    Pane.Register({ pane: serversRootPane }),
    Pane.Register({ pane: serverDetailPane }),
    ServerItemActions({ id: "open-console", component: OpenConsoleAction }),
  ],
} satisfies PluginDefinition;
