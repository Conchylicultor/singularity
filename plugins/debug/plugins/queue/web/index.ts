import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { queuePane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { queuePane } from "./panes";

export default {
  description:
    "Inspect and debug the jobs queue, events emission log, and active triggers.",
  contributions: [
    Pane.Register({ pane: queuePane }),
    DebugApp.Sidebar({
      id: "queue",
      title: "Queue",
      icon: symbol("library-add"),
      onClick: () => openPane(queuePane, {}, { mode: "root" }),
    }),
  ],
  slots: { queue: queuePane },
} satisfies PluginDefinition;
