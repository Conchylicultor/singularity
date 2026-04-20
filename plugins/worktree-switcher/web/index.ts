import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { WorktreeDropdown } from "./components/worktree-dropdown";

export default {
  id: "worktree-switcher",
  name: "Worktree Switcher",
  description: "Toolbar dropdown to switch the active worktree namespace.",
  contributions: [
    Shell.Toolbar({
      component: WorktreeDropdown,
      group: "namespace",
    }),
  ],
} satisfies PluginDefinition;
