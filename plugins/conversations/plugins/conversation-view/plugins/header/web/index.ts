import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Conversation } from "./slots";
export { HeaderView } from "./components/header-view";

export default {
  description:
    "Hosts the Conversation.Header slot — all header segments (title, chips) rendered in the PaneChrome title area.",
  contributions: [],
} satisfies PluginDefinition;
