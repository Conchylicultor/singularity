import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdMonitorHeart } from "react-icons/md";
import { liveStateHealthPane } from "./panes";

export { liveStateHealthPane } from "./panes";

export default {
  description: "Live health inspector for the client live-state pipeline (sockets, leader election, per-resource subscriptions), opened from the Debug sidebar.",
  contributions: [
    Pane.Register({ pane: liveStateHealthPane }),
    DebugApp.Sidebar({
      id: "live-state-health",
      ...sidebarNavItem({ title: "Live State", icon: MdMonitorHeart, onClick: () => openPane(liveStateHealthPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
