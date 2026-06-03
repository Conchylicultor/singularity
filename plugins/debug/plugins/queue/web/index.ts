import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdQueue } from "react-icons/md";
import { queuePane } from "./panes";

export { queuePane } from "./panes";

export default {
  name: "Queue",
  description:
    "Inspect and debug the jobs queue, events emission log, and active triggers.",
  contributions: [
    Pane.Register({ pane: queuePane }),
    DebugApp.Sidebar({
      id: "queue",
      ...sidebarNavItem({ title: "Queue", icon: MdQueue, onClick: () => openPane(queuePane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
