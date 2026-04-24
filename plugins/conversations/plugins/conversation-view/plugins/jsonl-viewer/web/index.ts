import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { JsonlButton } from "./components/jsonl-button";

// Importing panes registers `convJsonlPane` with the Pane registry.
import "./panes";

export { JsonlViewer } from "./slots";
export type { EventRendererContribution } from "./slots";

export default {
  id: "conversation-jsonl-viewer",
  name: "Conversation: JSONL viewer",
  description:
    "Toolbar button that opens a right pane rendering the raw Claude JSONL session log in human-readable form.",
  contributions: [Conversation.Toolbar({ component: JsonlButton })],
} satisfies PluginDefinition;
