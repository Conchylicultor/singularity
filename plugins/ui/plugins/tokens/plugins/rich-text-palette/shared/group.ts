import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

/**
 * Closed rich-text color palette (Notion-style). These CSS vars back inline text
 * color in the page block editor — the runs↔Lexical converter writes
 * `style="color: var(--rt-color-<token>)"` and reads it back, so the var names
 * here are a CONTRACT with `plugins/page/plugins/editor` (`ColorToken` minus
 * `default`). `default` has no var (the converter omits the style for it).
 *
 * `defineTokenGroup` kebab-cases each schema key, so `rtColorBlue` →
 * `--rt-color-blue`. The `default` field values below are the merge base; the
 * single preset (`./web/presets`) supplies the same light/dark values so the
 * completeness backstop is satisfied in both modes. Unlike the other token
 * groups this palette is intentionally CLOSED — it ships no picker / customizer
 * section, because the colors are a fixed product vocabulary, not user-tunable
 * theme tokens. They still flow through the token-group pipeline so they respect
 * light/dark and per-app theme scoping.
 */
export const richTextPaletteGroup = defineTokenGroup("rich-text-palette", {
  rtColorGray: { default: "oklch(0.55 0.01 260)", label: "Gray" },
  rtColorBrown: { default: "oklch(0.48 0.06 50)", label: "Brown" },
  rtColorOrange: { default: "oklch(0.62 0.16 50)", label: "Orange" },
  rtColorYellow: { default: "oklch(0.68 0.13 90)", label: "Yellow" },
  rtColorGreen: { default: "oklch(0.58 0.13 150)", label: "Green" },
  rtColorBlue: { default: "oklch(0.58 0.15 245)", label: "Blue" },
  rtColorPurple: { default: "oklch(0.55 0.18 300)", label: "Purple" },
  rtColorPink: { default: "oklch(0.62 0.18 350)", label: "Pink" },
  rtColorRed: { default: "oklch(0.58 0.20 25)", label: "Red" },
});

export type RichTextPaletteValues = {
  [K in keyof typeof richTextPaletteGroup.schema]: string;
};
