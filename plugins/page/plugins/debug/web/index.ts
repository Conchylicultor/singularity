import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdEditNote } from "react-icons/md";
import { pageDebugPane } from "./panes";

export { pageDebugPane } from "./panes";

export default {
  id: "page-debug",
  name: "Page Editor",
  description: "Debug harness for the block-based page editor.",
  contributions: [
    Pane.Register({ pane: pageDebugPane }),
    DebugApp.Sidebar({
      id: "page-editor",
      ...sidebarNavItem({
        title: "Page Editor",
        icon: MdEditNote,
        onClick: () => openPane(pageDebugPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
