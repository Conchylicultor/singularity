import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdSync } from "react-icons/md";
import { zeroTestPane } from "./panes";

export { zeroTestPane } from "./panes";

export default {
  description:
    "Temporary verification harness: a Debug → Zero Test pane that renders the pilot tasks slice live through the Zero client adapter. Deleted once a real migration begins.",
  contributions: [
    Pane.Register({ pane: zeroTestPane }),
    DebugApp.Sidebar({
      id: "zero-test",
      ...sidebarNavItem({
        title: "Zero Test",
        icon: MdSync,
        onClick: () => openPane(zeroTestPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
