import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { richTextPaletteGroup } from "../core";

/**
 * Rich-text color palette token group. Emits the closed `--rt-color-<token>`
 * vars consumed by the page block editor's inline color marks. Deliberately a
 * minimal token group: its values are its schema defaults (a light and a dark
 * tone per color) and it has NO customizer section — the palette is a closed
 * product vocabulary, not a user-tunable theme. It still rides the token-group
 * pipeline so the vars respect light/dark and per-app theme scoping for free.
 */
export default {
  description:
    "Rich-text color palette token group: the closed --rt-color-<token> vars backing inline text color in the page block editor.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "rich-text-palette",
      label: "Rich-text palette",
      descriptor: richTextPaletteGroup,
    }),
  ],
} satisfies PluginDefinition;
