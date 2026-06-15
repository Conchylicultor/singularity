import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLayers } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { compositionsPane } from "./panes";

export default {
  description:
    "Compositions pane: list named compositions and live-edit the working draft (contributor + entry-point selection) that drives the Explorer closure tint.",
  contributions: [
    Pane.Register({ pane: compositionsPane }),
    Studio.Sidebar({
      id: "compositions",
      ...sidebarNavItem({
        title: "Compositions",
        icon: MdLayers,
        onClick: () => openPane(compositionsPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
