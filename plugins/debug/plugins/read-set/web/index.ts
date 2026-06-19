import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdTableChart } from "react-icons/md";
import { readSetPane } from "./panes";

export { readSetPane } from "./panes";

export default {
  description: "Read-set capture debug pane: the automatic loader→table dependency index plus a diff against the hand-drawn dependsOn graph.",
  contributions: [
    Pane.Register({ pane: readSetPane }),
    DebugApp.Sidebar({
      id: "read-set",
      ...sidebarNavItem({ title: "Read-set", icon: MdTableChart, onClick: () => openPane(readSetPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
