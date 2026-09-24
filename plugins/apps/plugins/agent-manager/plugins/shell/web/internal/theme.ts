import { both, defineTheme } from "@plugins/ui/plugins/theme-engine/core";
import { colorPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/color-palette/core";
import { sidebarPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/sidebar-palette/core";
import { fontFamilyGroup } from "@plugins/ui/plugins/tokens/plugins/font-family/core";
import { shapeGroup } from "@plugins/ui/plugins/tokens/plugins/shape/core";

/**
 * Mist, the agent manager's look (prototype proto-1789643584-ldt6): cool,
 * lifted slate surfaces, a teal accent, and no colour beyond what the theme
 * has a slot for — selection and hover are neutral greys, never a teal wash.
 *
 * The surface ramp, darkest first: the page (`background`), the sidebar and
 * cards one step up, then the quiet fill every hover, chip, pill and selected
 * row shares.
 */
const DARK = {
  page: "oklch(0.195 0.012 248)",
  panel: "oklch(0.225 0.013 246)",
  fill: "oklch(0.265 0.015 244)",
  // Soft, not white: the app's usual 0.82 text lightness, tinted to the slate.
  text: "oklch(0.82 0.008 240)",
  // The secondary text tier: nav labels, sidebar text.
  text2: "oklch(0.8 0.012 238)",
  mutedText: "oklch(0.66 0.014 238)",
  faintText: "oklch(0.52 0.014 240)",
  teal: "oklch(0.78 0.1 208)",
  // Dark ink on a teal fill.
  tealInk: "oklch(0.28 0.05 220)",
  // One hairline for every border; the prompt field's outline one step firmer.
  border: "oklch(0.33 0.018 244 / 0.45)",
  input: "oklch(0.35 0.02 244 / 0.7)",
};

/** A readable light inversion: Mist is designed dark, but a theme resolves in both modes. */
const LIGHT = {
  page: "oklch(0.985 0.003 240)",
  panel: "oklch(0.965 0.005 240)",
  fill: "oklch(0.93 0.008 240)",
  text: "oklch(0.2 0.015 245)",
  text2: "oklch(0.32 0.015 242)",
  mutedText: "oklch(0.48 0.014 240)",
  faintText: "oklch(0.62 0.012 240)",
  teal: "oklch(0.55 0.1 208)",
  tealInk: "oklch(0.99 0 0)",
  border: "oklch(0.25 0.02 244 / 0.1)",
  input: "oklch(0.25 0.02 244 / 0.2)",
};

const colorPalette = colorPaletteGroup.fragment({
  dark: {
    background: DARK.page,
    foreground: DARK.text,
    card: DARK.panel,
    cardForeground: DARK.text,
    popover: DARK.panel,
    popoverForeground: DARK.text,
    primary: DARK.teal,
    primaryForeground: DARK.tealInk,
    secondary: DARK.fill,
    secondaryForeground: DARK.text,
    muted: DARK.fill,
    mutedForeground: DARK.mutedText,
    faintForeground: DARK.faintText,
    accent: DARK.fill,
    accentForeground: DARK.text,
    // Coral, green, amber and periwinkle — Mist's status colours.
    destructive: "oklch(0.74 0.11 28)",
    destructiveForeground: "oklch(0.985 0 0)",
    success: "oklch(0.8 0.11 158)",
    successForeground: "oklch(0.2 0.03 158)",
    warning: "oklch(0.82 0.12 82)",
    warningForeground: "oklch(0.2 0.03 82)",
    info: "oklch(0.76 0.1 244)",
    infoForeground: "oklch(0.2 0.03 244)",
    border: DARK.border,
    input: DARK.input,
    ring: DARK.teal,
  },
  light: {
    background: LIGHT.page,
    foreground: LIGHT.text,
    card: "oklch(1 0 0)",
    cardForeground: LIGHT.text,
    popover: "oklch(1 0 0)",
    popoverForeground: LIGHT.text,
    primary: LIGHT.teal,
    primaryForeground: LIGHT.tealInk,
    secondary: LIGHT.fill,
    secondaryForeground: LIGHT.text,
    muted: LIGHT.fill,
    mutedForeground: LIGHT.mutedText,
    faintForeground: LIGHT.faintText,
    accent: LIGHT.fill,
    accentForeground: LIGHT.text,
    destructive: "oklch(0.6 0.16 28)",
    destructiveForeground: "oklch(0.99 0 0)",
    success: "oklch(0.55 0.13 158)",
    successForeground: "oklch(0.99 0 0)",
    warning: "oklch(0.7 0.14 70)",
    warningForeground: "oklch(0.2 0.03 70)",
    info: "oklch(0.55 0.12 244)",
    infoForeground: "oklch(0.99 0 0)",
    border: LIGHT.border,
    input: LIGHT.input,
    ring: LIGHT.teal,
  },
});

/**
 * The sidebar sits one step above the page. Its selected nav item is the same
 * neutral fill as a hovered or selected row, with ordinary text.
 */
const sidebarPalette = sidebarPaletteGroup.fragment({
  dark: {
    sidebar: DARK.panel,
    sidebarForeground: DARK.text2,
    sidebarPrimary: DARK.teal,
    sidebarPrimaryForeground: DARK.tealInk,
    sidebarBorder: DARK.border,
    sidebarAccent: DARK.fill,
    sidebarAccentForeground: DARK.text,
    sidebarRing: DARK.teal,
  },
  light: {
    sidebar: LIGHT.panel,
    sidebarForeground: LIGHT.text2,
    sidebarPrimary: LIGHT.teal,
    sidebarPrimaryForeground: LIGHT.tealInk,
    sidebarBorder: LIGHT.border,
    sidebarAccent: LIGHT.fill,
    sidebarAccentForeground: LIGHT.text,
    sidebarRing: LIGHT.teal,
  },
});

/** Inter for text (the bundled face, stated so it stays true) and JetBrains Mono for code. */
const fontFamily = fontFamilyGroup.fragment(
  both({
    fontSans: "'Inter Variable', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
  }),
);

/**
 * Softer corners: rows and small controls (`rounded-md`, 0.8×) land on Mist's
 * 9px, buttons (`rounded-lg`, 1×) on 11px.
 */
const shape = shapeGroup.fragment(both({ radius: "0.7rem" }));

/**
 * The agent manager's own theme. Selected for the app in
 * `config/ui/theme-engine/@app/agent-manager/theme.jsonc`; a group it does not
 * mention paints that group's schema defaults, never the desktop's choice.
 */
export const mistTheme = defineTheme({
  id: "mist",
  label: "Mist",
  fragments: [colorPalette, sidebarPalette, fontFamily, shape],
});
