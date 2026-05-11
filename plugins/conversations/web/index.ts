import type { PluginDefinition } from "@core";

export {
  useConversations,
  useConversation,
  useConversationById,
  GonePageSchema,
} from "./use-conversations";
export { useConversationAction } from "./use-conversation-action";
export type { ConversationActionOpts } from "./use-conversation-action";

export default {
  id: "conversations",
  name: "Conversations",
  description: "Conversation domain: shared hooks and client-side API.",
  loadBearing: true,
} satisfies PluginDefinition;
