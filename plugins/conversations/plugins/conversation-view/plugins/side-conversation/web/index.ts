import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { convSidePane } from "./panes";

export { convSidePane } from "./panes";

export default {
  id: "conversation-side-conversation",
  name: "Conversation: Side conversation",
  description:
    "Right side pane that shows a second conversation alongside the host (read-only viewer; expand to pop out).",
  contributions: [Pane.Register({ pane: convSidePane })],
} satisfies PluginDefinition;
