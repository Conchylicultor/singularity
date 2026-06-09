import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdBolt } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { eventsTestPane } from "./panes";

export { eventsTestPane } from "./panes";

export default {
  description: "Dummy UI for exercising the events plugin end-to-end.",
  contributions: [
    Pane.Register({ pane: eventsTestPane }),
    DebugApp.Sidebar({
      id: "events-test",
      ...sidebarNavItem({ title: "Events Test", icon: MdBolt, onClick: () => openPane(eventsTestPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
