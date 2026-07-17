import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SidebarDataView } from "./host";
export type { ConversationSidebarProps } from "./host";

export default {
  description:
    "Umbrella for the DataView conversation-list sidebar: owns the tab host mounted directly by the conversations-view mount point. Per-tab sub-plugins (Queue, History) contribute their tab into SidebarDataView.View.",
  contributions: [],
} satisfies PluginDefinition;
