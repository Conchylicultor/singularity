import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Conversation } from "./slots";
export { ActionBarView } from "./components/action-bar";

export default {
  name: "Conversation Action Bar",
  description:
    "Hosts the Conversation.ActionBar slot — action buttons rendered in the JSONL viewer header.",
  contributions: [],
} satisfies PluginDefinition;
