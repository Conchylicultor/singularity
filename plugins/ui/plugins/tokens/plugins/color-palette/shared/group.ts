import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const colorPaletteGroup = defineTokenGroup("color-palette", {
  background: { default: "oklch(1 0 0)", label: "Background" },
  foreground: { default: "oklch(0.145 0 0)", label: "Text" },
  card: { default: "oklch(1 0 0)", label: "Card" },
  cardForeground: { default: "oklch(0.145 0 0)", label: "Card text" },
  popover: { default: "oklch(1 0 0)", label: "Popover" },
  popoverForeground: { default: "oklch(0.145 0 0)", label: "Popover text" },
  primary: { default: "oklch(0.44 0.09 240)", label: "Primary" },
  primaryForeground: { default: "oklch(0.985 0 0)", label: "On primary" },
  secondary: { default: "oklch(0.97 0 0)", label: "Secondary" },
  secondaryForeground: { default: "oklch(0.205 0 0)", label: "On secondary" },
  muted: { default: "oklch(0.97 0 0)", label: "Muted surface" },
  mutedForeground: { default: "oklch(0.556 0 0)", label: "Muted text" },
  accent: { default: "oklch(0.97 0 0)", label: "Accent" },
  accentForeground: { default: "oklch(0.205 0 0)", label: "On accent" },
  destructive: { default: "oklch(0.577 0.245 27.325)", label: "Destructive" },
  destructiveForeground: { default: "oklch(1 0 0)", label: "Destructive text" },
  success: { default: "oklch(0.53 0.18 142)", label: "Success" },
  successForeground: { default: "oklch(1 0 0)", label: "Success text" },
  warning: { default: "oklch(0.72 0.17 60)", label: "Warning" },
  warningForeground: { default: "oklch(0.145 0 0)", label: "Warning text" },
  info: { default: "oklch(0.54 0.16 232)", label: "Info" },
  infoForeground: { default: "oklch(1 0 0)", label: "Info text" },
  border: { default: "oklch(0.922 0 0)", label: "Border" },
  input: { default: "oklch(0.922 0 0)", label: "Input border" },
  ring: { default: "oklch(0.708 0 0)", label: "Focus ring" },
});

export type ColorPaletteTokenValues = {
  [K in keyof typeof colorPaletteGroup.schema]: string;
};
