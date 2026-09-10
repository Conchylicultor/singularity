import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ConversationRow,
  ConversationRowById,
  type ConversationRowProps,
  type ConversationRowByIdProps,
  type ConversationRowChrome,
  type ConversationRowLayout,
} from "./components/conversation-row";

export default {
  description:
    "A conversation as a full-width list line that opens its run: a Row around a ConversationItem, selected while that run is the column this surface opened.",
  contributions: [],
} satisfies PluginDefinition;
