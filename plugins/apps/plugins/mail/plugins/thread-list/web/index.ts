import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { mailboxViewPane } from "./panes";

export { mailboxViewPane } from "./panes";

export default {
  description:
    "Thread-list column for the Mail app: the mailboxViewPane (segment v/:view) rendering a live, windowed keyset-paginated list of Gmail-style thread rows with unread bolding, star/attachment/important markers, and infinite scroll.",
  contributions: [Pane.Register({ pane: mailboxViewPane })],
} satisfies PluginDefinition;
