import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { eventsTestPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { eventsTestPane } from "./panes";

export default {
  description: "Dummy UI for exercising the events plugin end-to-end.",
  contributions: [
    Pane.Register({ pane: eventsTestPane }),
    DebugApp.Sidebar({
      id: "events-test",
      title: "Events Test",
      icon: symbol("bolt"),
      onClick: () => openPane(eventsTestPane, {}, { mode: "root" }),
    }),
  ],
  slots: { "events-test": eventsTestPane },
} satisfies PluginDefinition;
