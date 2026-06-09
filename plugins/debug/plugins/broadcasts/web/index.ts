import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdAnnouncement } from "react-icons/md";
import { broadcastsPane } from "./panes";

export { broadcastsPane } from "./panes";

export default {
  description: "View and edit cli/broadcasts.json broadcast messages for stale worktrees.",
  contributions: [
    Pane.Register({ pane: broadcastsPane }),
    DebugApp.Sidebar({
      id: "broadcasts",
      ...sidebarNavItem({ title: "Broadcasts", icon: MdAnnouncement, onClick: () => openPane(broadcastsPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
