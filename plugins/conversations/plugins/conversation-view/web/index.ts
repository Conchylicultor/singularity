import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "./panes";
import { ExpandConversationButton } from "./components/expand-button";
import { Conversation as ActionBarConversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";

export { Conversation } from "./slots";
export type { ConversationRecord } from "./slots";
export { conversationPane, ConversationProvide } from "./panes";
export { ConversationView } from "./components/conversation-view";
export {
  PromptDraftProvider,
  usePromptDraft,
  draftToPlainText,
  isDraftEmpty,
  EMPTY_DRAFT,
} from "./prompt-draft-context";
export type { PromptDraft } from "./prompt-draft-context";

export default {
  id: "conversation",
  name: "Conversation",
  description: "Conversation pane host. Toolbar/title go through PaneChrome via `conversationPane.Actions`; only `Conversation.PromptBar` lives here.",
  contributions: [
    Pane.Register({ pane: conversationPane }),
    // Pop out of an embedding split (Tasks/Agents) into /c/:convId.
    ActionBarConversation.ActionBar({ id: "expand-conversation", component: ExpandConversationButton }),
  ],
} satisfies PluginDefinition;
