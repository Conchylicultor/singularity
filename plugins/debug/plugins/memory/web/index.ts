import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
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
      title: "Memory",
      icon: MdMemory,
      onClick: () => memoryPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
