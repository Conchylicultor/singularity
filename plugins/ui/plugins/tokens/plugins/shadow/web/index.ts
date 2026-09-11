import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { shadowGroup } from "../core";
import { ShadowSection } from "./components/shadow-section";

export default {
  description:
    'Shadow token group (the shadow-2xs…2xl tiers) with its param-driven customizer section and "Fill from…" shortcuts.',
  contributions: [
    ThemeEngine.TokenGroup({
      id: "shadow",
      label: "Shadow",
      descriptor: shadowGroup,
    }),
    ThemeCustomizer.Section({
      id: "shadow",
      label: "Shadow",
      component: ShadowSection,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(shadowGroup, search, [
          "shadow",
          "color",
          "opacity",
          "blur",
          "spread",
          "offset",
        ]),
    }),
  ],
} satisfies PluginDefinition;
