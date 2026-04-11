import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { ThemeToggle } from "./components/theme-toggle";

const themePlugin: PluginDefinition = {
  id: "theme",
  name: "Theme",
  contributions: [
    Shell.Toolbar({ component: ThemeToggle, group: "widgets" }),
  ],
};

export default themePlugin;
