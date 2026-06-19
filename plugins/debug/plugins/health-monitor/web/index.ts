import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdSpeed } from "react-icons/md";
import { healthMonitorPane } from "./panes";

export { healthMonitorPane } from "./panes";

export default {
  description:
    "Health monitor debug pane: per-backend event-loop lag, phys_footprint/heap, and GC pressure over time, plus host load/memory/swap.",
  contributions: [
    Pane.Register({ pane: healthMonitorPane }),
    DebugApp.Sidebar({
      id: "health-monitor",
      ...sidebarNavItem({
        title: "Health",
        icon: MdSpeed,
        onClick: () => openPane(healthMonitorPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
