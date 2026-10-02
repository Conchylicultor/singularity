import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { fileTypePaletteGroup } from "../core";
import { FileTypePaletteSection } from "./components/file-type-palette-section";

export default {
  description:
    "File-type colour token group: the closed --file-<tone> tints file-type glyphs are drawn in (Seti's palette on dark, darkened on light) and the --folder tint, with their customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "file-type-palette",
      label: "File types",
      descriptor: fileTypePaletteGroup,
    }),
    ThemeCustomizer.Section({
      id: "file-type-palette",
      label: "File types",
      component: FileTypePaletteSection,
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(fileTypePaletteGroup, search),
    }),
  ],
} satisfies PluginDefinition;
