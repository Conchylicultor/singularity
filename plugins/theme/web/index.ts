import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { ThemeToggle, ExperimentalToggle } from "./components/theme-toggle";

const themePlugin: PluginDefinition = {
  id: "theme",
  name: "Theme",
  description: "Toolbar toggles for light/dark mode and a distinct theme on non-main worktrees.",
  contributions: [
    Shell.Toolbar({ component: ExperimentalToggle, group: "actions" }),
    Shell.Toolbar({ component: ThemeToggle, group: "actions" }),
  ],
};

export default themePlugin;
