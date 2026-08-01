import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { serversRootPane, serverDetailPane } from "./panes";
import { ServerDetail } from "./slots";
import { ServerEditForm } from "./components/server-edit-form";
import { ServerDeleteAction } from "./components/server-delete-action";
import {
  ServerItemActions,
  OpenConsoleAction,
} from "./components/server-item-actions";

export { serversRootPane, serverDetailPane, NEW_SERVER_ID } from "./panes";
export { Servers, ServerDetail } from "./slots";
export {
  serversResource,
  generateSshKeypair,
  importSshPrivateKey,
  SshKeySchema,
} from "../shared";
export type { Server, SshKey } from "../shared";

export default {
  description: "Server registry for the deployment platform.",
  contributions: [
    Pane.Register({ pane: serversRootPane }),
    Pane.Register({ pane: serverDetailPane }),
    // The pane's identity block, as a section like every other region — that is
    // what makes "a detail pane is one slot" literally true here. Carded like
    // its peers: the pane header already names the server, so collapsing it
    // loses nothing.
    //
    // Deliberately NOT `excludeFromReorder: true`, even though an identity block
    // should not be draggable: reorder's `applyTree` pins excluded entries LAST,
    // so the flag would drop this block to the bottom of the pane. Add it only
    // once reorder can pin an entry *in place*.
    ServerDetail.Section({
      id: "identity",
      label: "Server",
      component: ServerEditForm,
      actions: ServerDeleteAction,
      useDefaultOpen: () => true,
    }),
    ServerItemActions({ id: "open-console", component: OpenConsoleAction }),
  ],
} satisfies PluginDefinition;
