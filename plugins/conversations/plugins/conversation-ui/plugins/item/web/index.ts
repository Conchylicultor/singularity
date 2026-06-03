import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ConversationItem,
  ConvStatusDot,
  ConvSysBadge,
  ConvTitle,
  ConvRelativeTime,
  CONV_STATUS_DOT,
  formatRelativeTime,
  type ConversationItemConv,
  type ConversationItemProps,
} from "./components/conversation-item";
export { Item } from "./slots";

export default {
  name: "Conversation UI: Item",
  description:
    "Visual primitive for rendering a Conversation as a row or inline chip. Used by every surface that lists conversations.",
  contributions: [],
} satisfies PluginDefinition;
