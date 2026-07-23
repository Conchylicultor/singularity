import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdRuleFolder } from "react-icons/md";
import { configOrphansPane } from "./panes";

export { configOrphansPane } from "./panes";

export default {
  description:
    "Read-only audit of orphaned user-layer config files whose defineConfig descriptor is no longer live.",
  contributions: [
    Pane.Register({ pane: configOrphansPane }),
    DebugApp.Sidebar({
      id: "config-orphans",
      ...sidebarNavItem({ title: "Config Orphans", icon: MdRuleFolder, onClick: () => openPane(configOrphansPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
