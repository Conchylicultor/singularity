import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { QuickTheme } from "@plugins/ui/plugins/theme-engine/plugins/quick-theme/web";
import { ThemeToggle } from "./components/theme-toggle";

export default {
  description: "Light/dark switch inside the quick-theme popover.",
  contributions: [
    QuickTheme.Section({
      id: "color-mode",
      label: "Appearance",
      component: ThemeToggle,
    }),
  ],
} satisfies PluginDefinition;
