import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { CommunityBrowserSection } from "./components/community-browser-section";

export default {
  description:
    "Browse and apply themes from the tweakcn community catalog.",
  contributions: [
    ThemeCustomizer.Section({
      id: "community-browser",
      label: "Community Themes",
      component: CommunityBrowserSection,
    }),
  ],
} satisfies PluginDefinition;
