import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdPublish } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Forge } from "@plugins/apps/plugins/forge/plugins/shell/web";
import { publishPane } from "./panes";

export { Publish } from "./slots";
export type { TreeRowBadgeContribution } from "./slots";
export { usePluginTree } from "./context";

export default {
  id: "forge-publish",
  name: "Forge: Publish",
  description:
    "Sidebar entry and filterable tree pane for pre-publish plugin review.",
  contributions: [
    Pane.Register({ pane: publishPane }),
    Forge.Sidebar({
      id: "publish",
      ...sidebarNavItem({ title: "Publish", icon: MdPublish, onClick: () => openPane(publishPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
