import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { WorktreeDropdown } from "./components/worktree-dropdown";

const worktreeSwitcherPlugin: PluginDefinition = {
  id: "worktree-switcher",
  name: "Worktree Switcher",
  description: "Toolbar dropdown to switch the active worktree namespace.",
  contributions: [
    Shell.Toolbar({
      component: WorktreeDropdown,
      group: "namespace",
    }),
  ],
};

export default worktreeSwitcherPlugin;
