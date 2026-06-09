import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { autoAnswerConfig } from "../shared/config";

export {
  useConversations,
  useConversation,
  useConversationById,
  GonePageSchema,
} from "./use-conversations";
export type { ConversationsState } from "./use-conversations";
export default {
  collapsed: true,
  description: "Conversation domain: shared hooks and client-side API.",
  loadBearing: true,
  contributions: [ConfigV2.WebRegister({ descriptor: autoAnswerConfig })],
} satisfies PluginDefinition;
