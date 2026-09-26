import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation as ConversationSlots } from "./slots";

export { Conversation } from "./slots";
export { HeaderView } from "./components/header-view";
export { HeaderChip } from "./components/header-chip";

export default {
  description:
    "Hosts the Conversation.Header slot — all header segments (title, chips) rendered in the PaneChrome title area — and HeaderChip, the themable pill (header-chip pad and type tokens) the model and status chips share.",
  contributions: [],
  slots: ConversationSlots,
} satisfies PluginDefinition;
