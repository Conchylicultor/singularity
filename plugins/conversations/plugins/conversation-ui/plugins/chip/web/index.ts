import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ConversationChip,
  type ConversationChipProps,
} from "./components/conversation-chip";

export default {
  description:
    "A conversation as a clickable chip that opens its run: a ghost ToggleChip around an inline ConversationItem, active while that run is the open column.",
  contributions: [],
} satisfies PluginDefinition;
