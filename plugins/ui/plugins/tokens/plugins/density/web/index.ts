import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { densityGroup } from "../core";
import { DensitySection } from "./components/density-section";

export default {
  description:
    'Density token group (padding intents, control heights, the spacing ramp) with its customizer section and "Fill from…" shortcuts.',
  contributions: [
    ThemeEngine.TokenGroup({
      id: "density",
      label: "Density",
      descriptor: densityGroup,
    }),
    ThemeCustomizer.Section({
      id: "density",
      label: "Density",
      component: DensitySection,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(densityGroup, search),
    }),
  ],
} satisfies PluginDefinition;
