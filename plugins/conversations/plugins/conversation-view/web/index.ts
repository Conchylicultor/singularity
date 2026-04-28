import type { PluginDefinition } from "@core";

// Importing panes registers `conversationPane` with the Pane registry at
// module load time; PaneRouter then matches `/c/:convId` automatically.
import "./panes";

import { conversationPane } from "./panes";
import { ExpandConversationButton } from "./components/expand-button";

export { Conversation } from "./slots";
export type { ConversationRecord } from "./slots";
export { conversationPane, markMainPane, isMainPaneId } from "./panes";
export { ConversationView } from "./components/conversation-view";
export {
  PromptDraftProvider,
  usePromptDraft,
  draftToPlainText,
  isDraftEmpty,
  EMPTY_DRAFT,
} from "./prompt-draft-context";
export type {
  PromptDraft,
  PromptImageDraft,
} from "./prompt-draft-context";

export default {
  id: "conversation",
  name: "Conversation",
  description: "Conversation pane host. Toolbar/title go through PaneChrome via `conversationPane.Actions`; only `Conversation.PromptBar` lives here.",
  contributions: [
    // Pop out of an embedding split (Tasks/Agents) into /c/:convId.
    conversationPane.Actions({ component: ExpandConversationButton }),
  ],
} satisfies PluginDefinition;
