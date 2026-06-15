import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { richTextPaletteGroup, richTextPaletteConfig } from "../shared";
import { builtInPresets } from "./presets";

/**
 * Rich-text color palette token group. Emits the closed `--rt-color-<token>`
 * vars consumed by the page block editor's inline color marks. Deliberately a
 * minimal token group: a single fixed preset and NO `ThemeEngine.VariantGroup`
 * picker / `ThemeCustomizer.Section` — the palette is a closed product
 * vocabulary, not a user-tunable theme. It still rides the token-group pipeline
 * so the vars respect light/dark and per-app theme scoping for free.
 */
export default {
  description:
    "Rich-text color palette token group: the closed --rt-color-<token> vars backing inline text color in the page block editor.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: richTextPaletteConfig }),
    ThemeEngine.TokenGroup({
      id: "rich-text-palette",
      label: "Rich-text palette",
      descriptor: richTextPaletteGroup,
      usePresets: () => builtInPresets,
      configDescriptor: richTextPaletteConfig,
    }),
  ],
} satisfies PluginDefinition;
