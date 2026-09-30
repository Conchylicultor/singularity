import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { backgroundEntryPane, backgroundPane } from "./panes";

export default {
  description:
    "Debug → Background activity: a DataView over the pushed background.catalog — everything this backend runs on its own, grouped by kind, with a status dot, the trigger in words and its next run, and the last run — and a detail pane per entry with its scope, declaring plugin, recent runs and Run now.",
  contributions: [
    Pane.Register({ pane: backgroundPane }),
    Pane.Register({ pane: backgroundEntryPane }),
    DebugApp.Sidebar({
      id: "background",
      title: "Background activity",
      icon: symbol("schedule"),
      onClick: () => openPane(backgroundPane, {}, { mode: "root" }),
    }),
  ],
  slots: {
    background: backgroundPane,
    backgroundEntry: backgroundEntryPane,
  },
} satisfies PluginDefinition;
