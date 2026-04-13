import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { ThemeToggle, ExperimentalToggle } from "./components/theme-toggle";

const themePlugin: PluginDefinition = {
  id: "theme",
  name: "Theme",
  contributions: [
    Shell.Toolbar({ component: ExperimentalToggle, group: "actions" }),
    Shell.Toolbar({ component: ThemeToggle, group: "actions" }),
  ],
};

export default themePlugin;
