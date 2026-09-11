import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { shapeGroup } from "../core";
import { ShapeSection } from "./components/shape-section";

export default {
  description:
    'Shape token group (border radius, base spacing) with its customizer section and "Fill from…" shortcuts.',
  contributions: [
    ThemeEngine.TokenGroup({
      id: "shape",
      label: "Shape",
      descriptor: shapeGroup,
    }),
    ThemeCustomizer.Section({
      id: "shape",
      label: "Shape",
      component: ShapeSection,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) => tokenGroupMatchesSearch(shapeGroup, search),
    }),
  ],
} satisfies PluginDefinition;
