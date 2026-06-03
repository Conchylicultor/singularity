import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { ThemeToggle } from "./components/theme-toggle";

export default {
  name: "Theme",
  description: "Toolbar toggle for light/dark mode.",
  contributions: [
    ActionBar.Item({ id: "theme-light-dark", component: ThemeToggle }),
  ],
} satisfies PluginDefinition;
