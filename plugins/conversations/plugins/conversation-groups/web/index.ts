import type { PluginDefinition } from "@core";

export { GroupedConversationList } from "./components/grouped-conversation-list";
export type { GroupedConversationListProps } from "./components/grouped-conversation-list";

export default {
  id: "conversation-groups",
  name: "Conversation Groups",
  description:
    "User-defined groups in the conversation sidebar list — drag a conversation onto another to create a group; drag onto a group to join.",
  contributions: [],
} satisfies PluginDefinition;
