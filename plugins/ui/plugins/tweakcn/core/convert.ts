interface TweakcnCssVars {
  theme: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
}

interface PerGroupPreset {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Pick keys from source, renaming via keyMap (tweakcn key → Singularity key). */
function pick(
  source: Record<string, string>,
  keyMap: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tweakcnKey, singularityKey] of Object.entries(keyMap)) {
    if (tweakcnKey in source) {
      out[singularityKey] = source[tweakcnKey]!;
    }
  }
  return out;
}

const COLOR_PALETTE_MAP: Record<string, string> = {
  background: "background",
  foreground: "foreground",
  card: "card",
  "card-foreground": "cardForeground",
  popover: "popover",
  "popover-foreground": "popoverForeground",
  primary: "primary",
  "primary-foreground": "primaryForeground",
  secondary: "secondary",
  "secondary-foreground": "secondaryForeground",
  muted: "muted",
  "muted-foreground": "mutedForeground",
  accent: "accent",
  "accent-foreground": "accentForeground",
  destructive: "destructive",
  "destructive-foreground": "destructiveForeground",
  success: "success",
  "success-foreground": "successForeground",
  warning: "warning",
  "warning-foreground": "warningForeground",
  info: "info",
  "info-foreground": "infoForeground",
  border: "border",
  input: "input",
  ring: "ring",
};

const SIDEBAR_PALETTE_MAP: Record<string, string> = {
  sidebar: "sidebar",
  "sidebar-foreground": "sidebarForeground",
  "sidebar-primary": "sidebarPrimary",
  "sidebar-primary-foreground": "sidebarPrimaryForeground",
  "sidebar-accent": "sidebarAccent",
  "sidebar-accent-foreground": "sidebarAccentForeground",
  "sidebar-border": "sidebarBorder",
  "sidebar-ring": "sidebarRing",
};

const SHADOW_KEYS = [
  "shadow-2xs",
  "shadow-xs",
  "shadow-sm",
  "shadow",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
];

const CHART_KEYS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

export function convertTweakcnTheme(
  cssVars: TweakcnCssVars,
): Record<string, PerGroupPreset> {
  const result: Record<string, PerGroupPreset> = {};

  // color-palette: 25 tokens from light/dark
  result["color-palette"] = {
    light: pick(cssVars.light, COLOR_PALETTE_MAP),
    dark: pick(cssVars.dark, COLOR_PALETTE_MAP),
  };

  // sidebar-palette: 8 tokens from light/dark
  result["sidebar-palette"] = {
    light: pick(cssVars.light, SIDEBAR_PALETTE_MAP),
    dark: pick(cssVars.dark, SIDEBAR_PALETTE_MAP),
  };

  // shape: radius from theme (mode-independent), spacing from light only
  const shapeLight: Record<string, string> = {};
  const shapeDark: Record<string, string> = {};
  if ("radius" in cssVars.theme) {
    shapeLight.radius = cssVars.theme.radius!;
    shapeDark.radius = cssVars.theme.radius!;
  }
  if ("spacing" in cssVars.light) {
    shapeLight.spacing = cssVars.light.spacing!;
    shapeDark.spacing = cssVars.light.spacing!;
  }
  result["shape"] = { light: shapeLight, dark: shapeDark };

  // shadow: 8 tokens, verbatim kebab keys from light/dark
  const shadowIdentityMap: Record<string, string> = {};
  for (const k of SHADOW_KEYS) shadowIdentityMap[k] = k;
  result["shadow"] = {
    light: pick(cssVars.light, shadowIdentityMap),
    dark: pick(cssVars.dark, shadowIdentityMap),
  };

  // chart: 5 tokens, verbatim kebab keys from light/dark
  const chartIdentityMap: Record<string, string> = {};
  for (const k of CHART_KEYS) chartIdentityMap[k] = k;
  result["chart"] = {
    light: pick(cssVars.light, chartIdentityMap),
    dark: pick(cssVars.dark, chartIdentityMap),
  };

  // font-family: font-* from theme (mode-independent), tracking-normal from light
  // only. tweakcn themes carry font identity but never a type scale, so they
  // target the `font-family` group exclusively — the `type-scale` group is never
  // named here and stays whatever the user selected.
  const FONT_FAMILY_MAP: Record<string, string> = {
    "font-sans": "fontSans",
    "font-mono": "fontMono",
    "font-serif": "fontSerif",
  };
  const fontLight: Record<string, string> = {};
  const fontDark: Record<string, string> = {};
  // font-* from cssVars.theme
  for (const [tweakcnKey, singularityKey] of Object.entries(FONT_FAMILY_MAP)) {
    if (tweakcnKey in cssVars.theme) {
      fontLight[singularityKey] = cssVars.theme[tweakcnKey]!;
      fontDark[singularityKey] = cssVars.theme[tweakcnKey]!;
    }
  }
  // tracking-normal → letterSpacing, from light only (used for both modes)
  if ("tracking-normal" in cssVars.light) {
    fontLight.letterSpacing = cssVars.light["tracking-normal"]!;
    fontDark.letterSpacing = cssVars.light["tracking-normal"]!;
  }
  result["font-family"] = { light: fontLight, dark: fontDark };

  return result;
}
