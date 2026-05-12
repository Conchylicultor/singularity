import type { PluginDefinition } from "@core";
import { MdPublish } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Forge } from "@plugins/apps/plugins/forge/plugins/shell/web";
import { publishPane } from "./panes";

export default {
  id: "forge-publish",
  name: "Forge: Publish",
  description:
    "Sidebar entry and filterable tree pane for pre-publish plugin review.",
  contributions: [
    Pane.Register({ pane: publishPane }),
    Forge.Sidebar({
      id: "publish",
      ...sidebarNavItem({ title: "Publish", icon: MdPublish, onClick: () => openPane(publishPane, {}) }),
    }),
  ],
} satisfies PluginDefinition;
