import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SidebarSources, SIDEBAR_VIEW } from "./host";
export type { ConversationSidebarProps } from "./host";
export { ConversationsSidebarDataView } from "./components/conversations-sidebar-data-view";

export default {
  description:
    "Umbrella for the DataView conversation-list sidebar: owns the merged multi-source DataView surface (one config, one unified switcher) mounted directly by the conversations-view mount point. Per-source sub-plugins (Queue, History) contribute into SidebarSources.",
  contributions: [],
} satisfies PluginDefinition;
