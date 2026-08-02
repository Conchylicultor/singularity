import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { QuickTheme } from "@plugins/ui/plugins/theme-engine/plugins/quick-theme/web";
import {
  CommunityBrowserSection,
  useCommunityBrowserMatchesSearch,
} from "./components/community-browser-section";
import { QuickThemeSection } from "./components/quick-theme-section";

export default {
  description:
    "Browse and apply themes from the tweakcn community catalog.",
  contributions: [
    ThemeCustomizer.Section({
      id: "community-browser",
      label: "Community Themes",
      component: CommunityBrowserSection,
      // Section doesn't answer the search box ⇒ no card, rather than a bar over nothing.
      useAvailable: useCommunityBrowserMatchesSearch,
    }),
    // The same catalog, shaped for the quick-switch popover: a bounded, searchable
    // strip of swatches instead of the pane's full gallery.
    QuickTheme.Section({
      id: "community-themes",
      label: "Theme",
      component: QuickThemeSection,
    }),
  ],
} satisfies PluginDefinition;
