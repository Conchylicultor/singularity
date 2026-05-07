import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/shared";

export const sidebarPaletteGroup = defineTokenGroup("sidebar-palette", {
  sidebar: { default: "oklch(0.965 0 0)", label: "Sidebar" },
  sidebarForeground: { default: "oklch(0.145 0 0)", label: "Sidebar text" },
  sidebarBorder: { default: "oklch(0.902 0 0)", label: "Sidebar border" },
  sidebarAccent: { default: "oklch(0.94 0 0)", label: "Sidebar accent" },
  sidebarAccentForeground: {
    default: "oklch(0.205 0 0)",
    label: "Sidebar accent text",
  },
  sidebarRing: { default: "oklch(0.708 0 0)", label: "Sidebar ring" },
});

export type SidebarPaletteTokenValues = {
  [K in keyof typeof sidebarPaletteGroup.schema]: string;
};
