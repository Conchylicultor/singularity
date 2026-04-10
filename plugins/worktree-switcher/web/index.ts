import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { WorktreeDropdown } from "./components/worktree-dropdown";

const worktreeSwitcherPlugin: PluginDefinition = {
  id: "worktree-switcher",
  name: "Worktree Switcher",
  contributions: [
    Shell.ToolbarWidget({
      component: WorktreeDropdown,
    }),
  ],
};

export default worktreeSwitcherPlugin;
