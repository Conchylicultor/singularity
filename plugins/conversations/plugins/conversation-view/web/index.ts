import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "./panes";

export { Conversation } from "./slots";
export type { ConversationRecord } from "./slots";
export { conversationPane, ConversationProvide } from "./panes";
export { ConversationView } from "./components/conversation-view";
export { draftToPlainText, isDraftEmpty } from "./prompt-draft-utils";
export { PromptInsertProvider, usePromptInsert } from "./prompt-insert-context";

export default {
  id: "conversation",
  name: "Conversation",
  description: "Conversation pane host. Toolbar/title go through PaneChrome via `conversationPane.Actions`; only `Conversation.PromptBar` lives here.",
  contributions: [
    Pane.Register({ pane: conversationPane }),
  ],
} satisfies PluginDefinition;
