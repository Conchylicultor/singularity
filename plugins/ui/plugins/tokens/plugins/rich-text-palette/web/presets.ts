import type { RichTextPaletteValues } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: RichTextPaletteValues;
  dark: RichTextPaletteValues;
}

/**
 * The single closed rich-text color palette. Light tones are darker (readable on
 * a light page); dark tones are lighter + a touch more saturated (readable on a
 * dark page) — the Notion convention of "same hue, mode-tuned lightness". Both
 * maps are complete so the injector's completeness backstop passes in each mode.
 */
export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  light: {
    rtColorGray: "oklch(0.55 0.01 260)",
    rtColorBrown: "oklch(0.48 0.06 50)",
    rtColorOrange: "oklch(0.62 0.16 50)",
    rtColorYellow: "oklch(0.62 0.13 90)",
    rtColorGreen: "oklch(0.55 0.13 150)",
    rtColorBlue: "oklch(0.55 0.15 245)",
    rtColorPurple: "oklch(0.55 0.18 300)",
    rtColorPink: "oklch(0.60 0.18 350)",
    rtColorRed: "oklch(0.56 0.20 25)",
  },
  dark: {
    rtColorGray: "oklch(0.72 0.02 260)",
    rtColorBrown: "oklch(0.70 0.07 50)",
    rtColorOrange: "oklch(0.78 0.15 55)",
    rtColorYellow: "oklch(0.84 0.14 95)",
    rtColorGreen: "oklch(0.78 0.15 150)",
    rtColorBlue: "oklch(0.75 0.14 245)",
    rtColorPurple: "oklch(0.74 0.16 300)",
    rtColorPink: "oklch(0.78 0.16 350)",
    rtColorRed: "oklch(0.72 0.18 25)",
  },
};

export const builtInPresets: Preset[] = [defaultPreset];
