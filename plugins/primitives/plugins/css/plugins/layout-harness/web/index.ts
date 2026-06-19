import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdGridView } from "react-icons/md";
import { layoutLabPane } from "./internal/lab-pane";

export { layoutLabPane } from "./internal/lab-pane";

export default {
  description: "Live Layout Lab gallery: renders the layout-primitive fixture catalog across its width sweep, opened from the Debug sidebar.",
  contributions: [
    Pane.Register({ pane: layoutLabPane }),
    DebugApp.Sidebar({
      id: "layout-lab",
      ...sidebarNavItem({ title: "Layout Lab", icon: MdGridView, onClick: () => openPane(layoutLabPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
