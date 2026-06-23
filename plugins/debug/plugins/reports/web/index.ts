import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdBugReport } from "react-icons/md";
import { reportsPane, reportDetailPane } from "./panes";

export { reportsPane, reportDetailPane } from "./panes";

export default {
  description:
    "Debug pane listing all recorded reports (including low-signal/noise crashes) with kind, source, count, noise flag, and linked task.",
  contributions: [
    Pane.Register({ pane: reportsPane }),
    Pane.Register({ pane: reportDetailPane }),
    DebugApp.Sidebar({
      id: "reports",
      ...sidebarNavItem({ title: "Reports", icon: MdBugReport, onClick: () => openPane(reportsPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
