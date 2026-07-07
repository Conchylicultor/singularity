import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { ThemeToySection } from "./components/theme-toy";

export default {
  description:
    "Interactive theme-customizer toy on the public site: a preset switcher that restyles a sample app vignette live via locally-scoped CSS variables (no config writes, no persistence).",
  contributions: [
    Website.Section({
      id: "theme-toy",
      label: "Theme demo",
      component: ThemeToySection,
    }),
  ],
} satisfies PluginDefinition;
