import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { ThemeToggle } from "./components/theme-toggle";

export default {
  id: "theme",
  name: "Theme",
  description: "Toolbar toggle for light/dark mode.",
  contributions: [
    Shell.Toolbar({ id: "theme-light-dark", component: ThemeToggle, group: "actions" }),
  ],
} satisfies PluginDefinition;
