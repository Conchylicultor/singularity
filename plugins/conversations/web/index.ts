import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useConversations,
  useConversation,
  useConversationById,
  GonePageSchema,
} from "./use-conversations";
export default {
  id: "conversations",
  name: "Conversations",
  description: "Conversation domain: shared hooks and client-side API.",
  loadBearing: true,
} satisfies PluginDefinition;
