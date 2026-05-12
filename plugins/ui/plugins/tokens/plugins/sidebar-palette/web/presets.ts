import type { SidebarPaletteTokenValues } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: SidebarPaletteTokenValues;
  dark: SidebarPaletteTokenValues;
}

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  light: {
    sidebar: "oklch(0.965 0 0)",
    sidebarForeground: "oklch(0.145 0 0)",
    sidebarBorder: "oklch(0.902 0 0)",
    sidebarAccent: "oklch(0.94 0 0)",
    sidebarAccentForeground: "oklch(0.205 0 0)",
    sidebarRing: "oklch(0.708 0 0)",
  },
  dark: {
    sidebar: "oklch(0.205 0 0)",
    sidebarForeground: "oklch(0.88 0 0)",
    sidebarBorder: "oklch(1 0 0 / 15%)",
    sidebarAccent: "oklch(0.269 0 0)",
    sidebarAccentForeground: "oklch(0.88 0 0)",
    sidebarRing: "oklch(0.556 0 0)",
  },
};

export const warmPreset: Preset = {
  id: "warm",
  label: "Warm",
  light: {
    sidebar: "oklch(0.93 0.06 75)",
    sidebarForeground: "oklch(0.18 0.04 55)",
    sidebarBorder: "oklch(0.82 0.10 75)",
    sidebarAccent: "oklch(0.88 0.08 70)",
    sidebarAccentForeground: "oklch(0.22 0.04 55)",
    sidebarRing: "oklch(0.55 0.14 55)",
  },
  dark: {
    sidebar: "oklch(0.25 0.05 60)",
    sidebarForeground: "oklch(0.90 0.03 70)",
    sidebarBorder: "oklch(0.45 0.10 60)",
    sidebarAccent: "oklch(0.32 0.06 60)",
    sidebarAccentForeground: "oklch(0.90 0.03 70)",
    sidebarRing: "oklch(0.65 0.14 55)",
  },
};

export const builtInPresets: Preset[] = [defaultPreset, warmPreset];
