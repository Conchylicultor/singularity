import { both, defineTheme } from "@plugins/ui/plugins/theme-engine/core";
import { colorPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/color-palette/core";
import { sidebarPaletteGroup } from "@plugins/ui/plugins/tokens/plugins/sidebar-palette/core";
import { fontFamilyGroup } from "@plugins/ui/plugins/tokens/plugins/font-family/core";
import { shapeGroup } from "@plugins/ui/plugins/tokens/plugins/shape/core";
import { sidebarMetricsGroup } from "@plugins/ui/plugins/tokens/plugins/sidebar-metrics/core";
import { densityGroup } from "@plugins/ui/plugins/tokens/plugins/density/core";
import { typeScaleGroup } from "@plugins/ui/plugins/tokens/plugins/type-scale/core";

/**
 * Mist, the agent manager's look (prototype proto-1789643584-ldt6): cool,
 * lifted slate surfaces, a teal accent, and no colour beyond what the theme
 * has a slot for — selection, hover and focus are neutral greys, never a teal wash.
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
  // The emphasised tier, near white: the selected row, the active nav item,
  // the brand and the model picker.
  textStrong: "oklch(0.95 0.005 240)",
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
  // Focus is grey, never teal: the prompt field and every control ring in it.
  ring: "oklch(0.66 0.014 238)",
};

/** A readable light inversion: Mist is designed dark, but a theme resolves in both modes. */
const LIGHT = {
  page: "oklch(0.985 0.003 240)",
  panel: "oklch(0.965 0.005 240)",
  fill: "oklch(0.93 0.008 240)",
  text: "oklch(0.2 0.015 245)",
  textStrong: "oklch(0.13 0.015 245)",
  text2: "oklch(0.32 0.015 242)",
  mutedText: "oklch(0.48 0.014 240)",
  faintText: "oklch(0.62 0.012 240)",
  teal: "oklch(0.55 0.1 208)",
  tealInk: "oklch(0.99 0 0)",
  border: "oklch(0.25 0.02 244 / 0.1)",
  input: "oklch(0.25 0.02 244 / 0.2)",
  ring: "oklch(0.48 0.014 240)",
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
    // A selected row's label reads brighter than its neighbours'.
    accentForeground: DARK.textStrong,
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
    ring: DARK.ring,
    // The main pane's roles. Only the conversation title takes the strong
    // step; header chips and footer pills sit on the secondary one.
    strongForeground: DARK.textStrong,
    subtleForeground: DARK.text2,
    // Thread cards, header chips and the prompt box sit one step up on the
    // panel tone, edged by the one hairline; outlined controls (the prompt's
    // split template chips) fill with the hover tone.
    chip: DARK.panel,
    messageCard: DARK.panel,
    messageCardBorder: DARK.border,
    threadCard: DARK.panel,
    threadCardBorder: DARK.border,
    composer: DARK.panel,
    outlineBorder: DARK.border,
    outlineFill: DARK.fill,
    codeBorder: DARK.border,
    // Toolbar glyphs and counters recede; hover brings them to full text.
    toolbarForeground: DARK.mutedText,
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
    accentForeground: LIGHT.textStrong,
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
    ring: LIGHT.ring,
    strongForeground: LIGHT.textStrong,
    subtleForeground: LIGHT.text2,
    chip: LIGHT.panel,
    messageCard: LIGHT.panel,
    messageCardBorder: LIGHT.border,
    threadCard: LIGHT.panel,
    threadCardBorder: LIGHT.border,
    composer: LIGHT.panel,
    outlineBorder: LIGHT.border,
    outlineFill: LIGHT.fill,
    codeBorder: LIGHT.border,
    toolbarForeground: LIGHT.mutedText,
  },
});

/**
 * The sidebar sits one step above the page. Its active nav item is the same
 * neutral fill as a hovered or selected row, with the emphasised text (as are
 * the brand and the model picker); nav icons at rest are muted.
 */
const sidebarPalette = sidebarPaletteGroup.fragment({
  dark: {
    sidebar: DARK.panel,
    sidebarForeground: DARK.text2,
    sidebarPrimary: DARK.teal,
    sidebarPrimaryForeground: DARK.tealInk,
    sidebarBorder: DARK.border,
    sidebarAccent: DARK.fill,
    sidebarAccentForeground: DARK.textStrong,
    sidebarIcon: DARK.mutedText,
    sidebarRing: DARK.ring,
  },
  light: {
    sidebar: LIGHT.panel,
    sidebarForeground: LIGHT.text2,
    sidebarPrimary: LIGHT.teal,
    sidebarPrimaryForeground: LIGHT.tealInk,
    sidebarBorder: LIGHT.border,
    sidebarAccent: LIGHT.fill,
    sidebarAccentForeground: LIGHT.textStrong,
    sidebarIcon: LIGHT.mutedText,
    sidebarRing: LIGHT.ring,
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
 * 9px, and so do the `md` / `lg` buttons and button-group segments
 * (`radiusControl`). Raised cards — the thread's user message, tool rows and
 * prompt box — take the mockup's 12px (`radiusCard`). A tool badge is an 8px
 * box edged in its own colour, an inline code span a 7px bordered chip.
 */
const shape = shapeGroup.fragment(
  both({
    radius: "0.7rem",
    radiusControl: "0.5625rem",
    radiusCard: "0.75rem",
    radiusToolBadge: "0.5rem",
    borderToolBadge: "1px",
    radiusCode: "0.4375rem",
    borderCode: "1px",
  }),
);

/**
 * The mockup's sidebar geometry: a 246px panel, 28px nav rows padded 9px, 15px
 * icons with an 11px gap to a medium-weight label.
 */
const sidebarMetrics = sidebarMetricsGroup.fragment(
  both({
    sidebarPanelWidth: "15.375rem",
    sidebarRowHeight: "1.75rem",
    sidebarRowPadX: "0.5625rem",
    sidebarIconSize: "0.9375rem",
    sidebarIconGap: "0.6875rem",
    sidebarLabelWeight: "500",
  }),
);

/**
 * 7px status dots at the `md` tier (the sidebar's conversation rows and model
 * picker), and a tighter compact chip — 1px × 4px padding, 6px corners — for a
 * row's count chip.
 *
 * The control ladder, from the mockup's main pane: `xs` is the footer pill
 * (25px, 10px padding, 12px icons), `sm` the toolbar button (26px, 7px padding,
 * 13px icons), `md` the primary Stop / Restore button (29px, 14px padding).
 *
 * The main pane's geometry: a 45px title bar inset 8px before its sidebar
 * toggle and 16px after its last chip, a toolbar strip inset 14px, header chips
 * padded 4px × 11px (a 25px pill), thread cards padded 10px × 13px, a prompt
 * box padded 10px 13px 9px around unpadded text with 8px before its action
 * row, a 9px × 3px tool badge, 6px × 1.5px inline code, a 26px split arrow
 * (6px either side of its 12px glyph) and an 11px op-status glyph.
 */
const density = densityGroup.fragment(
  both({
    statusDotMd: "0.4375rem",
    padChipCompactX: "0.25rem",
    padChipCompactY: "0.0625rem",
    radiusChipCompact: "0.375rem",
    controlHeightXs: "1.5625rem",
    controlHeightSm: "1.625rem",
    controlHeightMd: "1.8125rem",
    controlPadXs: "0.625rem",
    controlPadSm: "0.4375rem",
    controlPadMd: "0.875rem",
    controlIconXs: "0.75rem",
    controlIconSm: "0.8125rem",
    controlIconMd: "0.8125rem",
    chromePaneH: "2.8125rem",
    chromePanePadStart: "0.5rem",
    chromePanePadEnd: "1rem",
    subpanePadX: "0.875rem",
    padChipHeaderX: "0.6875rem",
    padChipHeaderY: "0.25rem",
    padThreadCardX: "0.8125rem",
    padThreadCardY: "0.625rem",
    padComposer: "0.625rem 0.8125rem 0.5625rem",
    padComposerText: "0 0 0.5rem",
    padComposerActions: "0",
    padToolBadgeX: "0.5625rem",
    padToolBadgeY: "0.1875rem",
    padCodeX: "0.375rem",
    padCodeY: "0.09375rem",
    padSplitArrowX: "0.375rem",
    opStatusIcon: "0.6875rem",
  }),
);

/**
 * The mockup's smaller type: 12px inherited text on a 1.4 line (the base,
 * set on the app's scope root, never on `html`), 12.5px prose on a 17.5px line,
 * and 11px semibold control labels at every size. The compact chip's text is
 * 9.5px semibold on a 15px line (a 17px chip). In the main pane: 11px semibold
 * header chips and toolbar counts, a 10.5px bold tool badge, 11.5px inline
 * code, and a bold primary action.
 */
const typeScale = typeScaleGroup.fragment(
  both({
    fontSizeBase: "0.75rem",
    lineHeightBase: "1.4",
    // The thread keeps the column it had at 16px (75ch of Inter, 757px), the
    // mockup's width, rather than shrinking with the smaller base font.
    measureReading: "47.3125rem",
    fontSizeBody: "0.78125rem",
    lineHeightBody: "1.09375rem",
    fontSizeControl: "0.6875rem",
    fontSizeControlCompact: "0.6875rem",
    fontWeightControl: "600",
    fontSizeChipCompact: "0.59375rem",
    lineHeightChipCompact: "0.9375rem",
    fontWeightChipCompact: "600",
    fontWeightControlStrong: "700",
    fontSizeChipHeader: "0.6875rem",
    lineHeightChipHeader: "0.9375rem",
    fontWeightChipHeader: "600",
    fontSizeToolBadge: "0.65625rem",
    lineHeightToolBadge: "0.9375rem",
    fontWeightToolBadge: "700",
    fontSizeCode: "0.71875rem",
    fontSizeCount: "0.6875rem",
    fontWeightCount: "600",
  }),
);

/**
 * The agent manager's own theme. Selected for the app in
 * `config/ui/theme-engine/@app/agent-manager/theme.jsonc`; a group it does not
 * mention paints that group's schema defaults, never the desktop's choice.
 */
export const mistTheme = defineTheme({
  id: "mist",
  label: "Mist",
  fragments: [
    colorPalette,
    sidebarPalette,
    sidebarMetrics,
    density,
    typeScale,
    fontFamily,
    shape,
  ],
});
