import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { categoricalGroup } from "../core";
import { CategoricalSection } from "./components/categorical-section";

export default {
  description:
    "Categorical color palette token group: the categorical-1…10 series colors and their customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "categorical",
      label: "Categorical",
      descriptor: categoricalGroup,
    }),
    ThemeCustomizer.Section({
      id: "categorical",
      label: "Categorical",
      component: CategoricalSection,
      // No token in this group answers the search box ⇒ no card. The body
      // does not filter itself, so without this the section stayed put
      // (full) under a query that matched nothing in it.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(categoricalGroup, search),
    }),
  ],
} satisfies PluginDefinition;
