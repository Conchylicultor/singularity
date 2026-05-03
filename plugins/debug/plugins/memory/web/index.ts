import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { MdMemory } from "react-icons/md";
import { memoryPane } from "./panes";

export { memoryPane } from "./panes";

export default {
  id: "debug-memory",
  name: "Memory",
  description: "Browse Claude Code auto-memory files for the current project.",
  contributions: [
    Pane.Register({ pane: memoryPane }),
    Debug.Item({
      id: "memory",
      title: "Memory",
      icon: MdMemory,
      onClick: () => memoryPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
