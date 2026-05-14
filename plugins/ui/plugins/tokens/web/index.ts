import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";

export default {
  id: "ui-tokens",
  name: "UI: Token Groups",
  description:
    "Umbrella for CSS token group plugins. Contributes global theme presets.",
  contributions: [
    ThemeEngine.GlobalPreset({
      id: "default",
      label: "Default",
      groups: {
        "color-palette": "default",
        shape: "default",
        "sidebar-palette": "default",
      },
    }),
    ThemeEngine.GlobalPreset({
      id: "ocean",
      label: "Ocean",
      groups: {
        "color-palette": "ocean",
        shape: "rounded",
        "sidebar-palette": "default",
      },
    }),
    ThemeEngine.GlobalPreset({
      id: "warm",
      label: "Warm",
      groups: {
        "color-palette": "warm",
        shape: "default",
        "sidebar-palette": "warm",
      },
    }),
  ],
} satisfies PluginDefinition;
