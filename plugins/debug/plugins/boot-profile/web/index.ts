import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdTimeline } from "react-icons/md";
import { bootProfilePane } from "./panes";

export default {
  description:
    "Browser boot profiler Gantt debug page: the request → first-paint timeline plus per-resource wait/work split.",
  contributions: [
    Pane.Register({ pane: bootProfilePane }),
    DebugApp.Sidebar({
      id: "boot-profile",
      ...sidebarNavItem({
        title: "Boot Profile",
        icon: MdTimeline,
        onClick: () => openPane(bootProfilePane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
