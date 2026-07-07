import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { WebsitePlatform } from "@plugins/apps/plugins/website/plugins/pillars/plugins/platform/web";
import { ThemeToySection } from "./components/theme-toy";

export default {
  description:
    "Interactive theme-customizer toy on the public site's Platform page: a preset switcher that restyles a sample app vignette live via locally-scoped CSS variables (no config writes, no persistence) — theming as a plugin, demonstrated.",
  contributions: [
    WebsitePlatform.Section({
      id: "theme-toy",
      label: "Theme demo",
      component: ThemeToySection,
    }),
  ],
} satisfies PluginDefinition;
