import type { PluginDefinition } from "@core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdMemory } from "react-icons/md";
import { memoryPane } from "./panes";

export { memoryPane } from "./panes";

export default {
  id: "debug-memory",
  name: "Memory",
  description: "Browse Claude Code auto-memory files for the current project.",
  contributions: [
    Pane.Register({ pane: memoryPane }),
    DebugApp.Sidebar({
      id: "memory",
      ...sidebarNavItem({ title: "Memory", icon: MdMemory, onClick: () => openPane(memoryPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
