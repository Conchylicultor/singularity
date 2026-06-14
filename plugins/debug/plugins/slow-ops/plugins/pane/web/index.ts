import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdSpeed } from "react-icons/md";
import { slowOpsPane } from "./panes";

export { slowOpsPane } from "./panes";

export default {
  description:
    "Debug pane showing a global, ranked overview of slow operations with per-operation caller attribution.",
  contributions: [
    Pane.Register({ pane: slowOpsPane }),
    DebugApp.Sidebar({
      id: "slow-ops",
      ...sidebarNavItem({ title: "Slow Ops", icon: MdSpeed, onClick: () => openPane(slowOpsPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
