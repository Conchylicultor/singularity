import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { worktreeCleanupPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { worktreeCleanupPane } from "./panes";

export default {
  description:
    "Audit and remove stale git worktrees and their Postgres DB forks.",
  contributions: [
    Pane.Register({ pane: worktreeCleanupPane }),
    DebugApp.Sidebar({
      id: "worktree-cleanup",
      title: "Worktree Cleanup",
      icon: symbol("folder-delete"),
      onClick: () => openPane(worktreeCleanupPane, {}, { mode: "root" }),
    }),
  ],
  slots: { "worktree-cleanup": worktreeCleanupPane },
} satisfies PluginDefinition;
