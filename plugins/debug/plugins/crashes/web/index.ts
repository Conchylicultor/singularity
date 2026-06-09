import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdBugReport } from "react-icons/md";
import { crashesPane } from "./panes";

export { crashesPane } from "./panes";

export default {
  description:
    "Debug pane listing all recorded crashes (including low-signal/noise ones) with source, count, noise flag, and linked task.",
  contributions: [
    Pane.Register({ pane: crashesPane }),
    DebugApp.Sidebar({
      id: "crashes",
      ...sidebarNavItem({ title: "Crashes", icon: MdBugReport, onClick: () => openPane(crashesPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
