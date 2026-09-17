import { defineTheme } from "@plugins/ui/plugins/theme-engine/core";
import { colorPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/color-palette/core";
import { categoricalGroup } from "@plugins/ui/plugins/tokens/plugins/categorical/core";

const WHITE = "oklch(1 0 0)";
const BLACK = "oklch(0 0 0)";
const DARK_TEXT = "oklch(0.97 0 0)";
const LIGHT_TEXT = "oklch(0.16 0 0)";

/**
 * A neutral palette on a pure black page. Panels (the capsule, popups) sit one
 * clear step up at 0.155; the quiet fills (hover, muted wells) a step above
 * that.
 *
 * `primary` is the TEXT colour, not an accent: the launcher's one filled
 * control — the capsule's round New app button — reads as a text-coloured
 * circle with a page-coloured glyph, and the app tiles carry all the colour on
 * the page.
 */
const colorPalette = colorPaletteGroup.fragment({
  dark: {
    background: BLACK,
    foreground: DARK_TEXT,
    card: "oklch(0.155 0 0)",
    cardForeground: DARK_TEXT,
    popover: "oklch(0.155 0 0)",
    popoverForeground: DARK_TEXT,
    primary: DARK_TEXT,
    primaryForeground: BLACK,
    secondary: "oklch(0.21 0 0)",
    secondaryForeground: DARK_TEXT,
    muted: "oklch(0.19 0 0)",
    mutedForeground: "oklch(0.7 0 0)",
    accent: "oklch(0.23 0 0)",
    accentForeground: DARK_TEXT,
    destructive: "oklch(0.704 0.191 22.216)",
    destructiveForeground: "oklch(0.985 0 0)",
    success: "oklch(0.72 0.16 142)",
    successForeground: "oklch(0.145 0 0)",
    warning: "oklch(0.78 0.14 60)",
    warningForeground: "oklch(0.145 0 0)",
    info: "oklch(0.72 0.11 226)",
    infoForeground: BLACK,
    // Hairlines at 9% white; an input's outline (and the capsule's focused
    // border) at 16%.
    border: "oklch(1 0 0 / 9%)",
    input: "oklch(1 0 0 / 16%)",
    ring: "oklch(0.7 0 0)",
  },
  light: {
    background: WHITE,
    foreground: LIGHT_TEXT,
    card: "oklch(0.97 0 0)",
    cardForeground: LIGHT_TEXT,
    popover: WHITE,
    popoverForeground: LIGHT_TEXT,
    primary: LIGHT_TEXT,
    primaryForeground: WHITE,
    secondary: "oklch(0.94 0 0)",
    secondaryForeground: LIGHT_TEXT,
    muted: "oklch(0.95 0 0)",
    mutedForeground: "oklch(0.48 0 0)",
    accent: "oklch(0.93 0 0)",
    accentForeground: LIGHT_TEXT,
    destructive: "oklch(0.577 0.245 27.325)",
    destructiveForeground: WHITE,
    success: "oklch(0.53 0.18 142)",
    successForeground: WHITE,
    warning: "oklch(0.72 0.17 60)",
    warningForeground: "oklch(0.145 0 0)",
    info: "oklch(0.55 0.11 226)",
    infoForeground: WHITE,
    border: "oklch(0 0 0 / 9%)",
    input: "oklch(0 0 0 / 16%)",
    ring: "oklch(0.48 0 0)",
  },
});

/**
 * The ocean band the app tiles are painted from: slots 1–9 walk the hue from
 * teal (175) toward violet in 17° steps at one quiet chroma, alternating
 * lightness 0.50 / 0.57 so neighbours separate; a tile's second shade adds
 * 0.13 on top (the avatar primitive's rule). Slot 10 is the neutral slate an
 * app can ask for by name (Settings).
 *
 * The same in both modes: a tile is a flat fill under a white glyph, which
 * needs this lightness whatever the page behind it.
 */
const OCEAN = {
  "categorical-1": "oklch(0.50 0.11 175)",
  "categorical-2": "oklch(0.57 0.11 192)",
  "categorical-3": "oklch(0.50 0.11 209)",
  "categorical-4": "oklch(0.57 0.11 226)",
  "categorical-5": "oklch(0.50 0.11 243)",
  "categorical-6": "oklch(0.57 0.11 260)",
  "categorical-7": "oklch(0.50 0.11 277)",
  "categorical-8": "oklch(0.57 0.11 294)",
  "categorical-9": "oklch(0.50 0.11 311)",
  "categorical-10": "oklch(0.48 0.02 250)",
};
const categorical = categoricalGroup.fragment({ light: OCEAN, dark: OCEAN });

/**
 * Home's own theme — the launcher's look: a black page and ocean tiles.
 * Selected for the home app in `config/ui/theme-engine/@app/home/theme.jsonc`,
 * and scoped to the Home tab (`data-theme-scope="app:home"`), so agent avatars
 * and charts elsewhere keep their colours. A group it does not mention paints
 * that group's schema defaults, never the desktop's choice.
 */
export const homeTheme = defineTheme({
  id: "home",
  label: "Home",
  fragments: [colorPalette, categorical],
});
