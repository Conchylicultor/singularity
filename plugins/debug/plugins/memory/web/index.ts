import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { memoryPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { memoryPane } from "./panes";

export default {
  description: "Browse Claude Code auto-memory files for the current project.",
  contributions: [
    Pane.Register({ pane: memoryPane }),
    DebugApp.Sidebar({
      id: "memory",
      title: "Memory",
      icon: symbol("memory"),
      onClick: () => openPane(memoryPane, {}, { mode: "root" }),
    }),
  ],
  slots: { "debug-memory": memoryPane },
} satisfies PluginDefinition;
