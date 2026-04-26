import type { PluginDefinition } from "@core";

// Importing panes registers `conversationPane` with the Pane registry at
// module load time; PaneRouter then matches `/c/:convId` automatically.
import "./panes";

export { Conversation } from "./slots";
export type { ConversationRecord } from "./slots";
export { conversationPane, markMainPane, isMainPaneId } from "./panes";
export { ConversationView } from "./components/conversation-view";
export { PromptDraftProvider, usePromptDraft } from "./prompt-draft-context";

export default {
  id: "conversation",
  name: "Conversation",
  description: "Conversation pane and toolbar host; nested plugins extend `Conversation.Toolbar`.",
  contributions: [],
} satisfies PluginDefinition;
