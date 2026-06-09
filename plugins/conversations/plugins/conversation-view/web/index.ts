import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation as ConversationHeader } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { conversationPane } from "./panes";
import { ConversationTitle } from "./components/conversation-title";

export { Conversation } from "./slots";
export type { ConversationRecord } from "./slots";
export { conversationPane } from "./panes";
export { ConversationView } from "./components/conversation-view";
export { draftToPlainText, isDraftEmpty } from "./prompt-draft-utils";
export { PromptInsertProvider, usePromptInsert } from "./prompt-insert-context";

export default {
  description: "Conversation pane host. Header and prompt bar are slot-driven; Conversation.Header hosts title and toolbar chips.",
  contributions: [
    Pane.Register({ pane: conversationPane }),
    ConversationHeader.Header({ id: "title", component: ConversationTitle }),
  ],
} satisfies PluginDefinition;
