import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { reportsPane, reportDetailPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { reportsPane, reportDetailPane } from "./panes";

export default {
  description:
    "Debug pane listing all recorded reports (including low-signal/noise crashes) with kind, source, count, noise flag, and linked task.",
  contributions: [
    Pane.Register({ pane: reportsPane }),
    Pane.Register({ pane: reportDetailPane }),
    DebugApp.Sidebar({
      id: "reports",
      title: "Reports",
      icon: symbol("bug-report"),
      onClick: () => openPane(reportsPane, {}, { mode: "root" }),
    }),
  ],
  slots: { reports: reportsPane, "report-detail": reportDetailPane },
} satisfies PluginDefinition;
