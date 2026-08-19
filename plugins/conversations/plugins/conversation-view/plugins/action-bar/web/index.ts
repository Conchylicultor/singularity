import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation as ConversationSlots } from "./slots";

export { Conversation } from "./slots";
export { ActionBarView } from "./components/action-bar";

export default {
  description:
    "Hosts the Conversation.ActionBar slot — action buttons rendered in the JSONL viewer header.",
  contributions: [],
  slots: ConversationSlots,
} satisfies PluginDefinition;
