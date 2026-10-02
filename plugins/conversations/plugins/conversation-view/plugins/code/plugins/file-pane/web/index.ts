import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { filePeekPane } from "./file-peek-pane";
import { FilePeekTabs } from "./components/file-peek-header";

export { FilePaneView } from "./components/file-pane";
export { filePeekPane } from "./file-peek-pane";

export default {
  description:
    "Hosts the file-peek pane: a checkout file opened from a conversation (chat file links, review, commits), shown through primitives/file-viewer with the conversation's edited-file status as context.",
  contributions: [
    Pane.Register({ pane: filePeekPane }),
    filePeekPane.Actions({ id: "renderer-tabs", component: FilePeekTabs }),
  ],
  slots: { "file-peek": filePeekPane },
} satisfies PluginDefinition;
