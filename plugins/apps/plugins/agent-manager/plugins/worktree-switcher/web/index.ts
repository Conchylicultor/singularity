import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { WorktreeDropdown } from "./components/worktree-dropdown";

export default {
  // Now global chrome (shown in the tab-bar action bar on every app), no longer
  // agent-manager-specific. Candidate for a future move out of this namespace.
  description: "Current worktree namespace label in the global action bar.",
  contributions: [
    ActionBar.Item({ id: "worktree-switcher", component: WorktreeDropdown }),
  ],
} satisfies PluginDefinition;
