import { defineConfig } from "@plugins/config/core";

export const sidebarPaletteConfig = defineConfig({
  preset: { default: "default", label: "Sidebar Palette preset" },
  overrides: { default: "{}", label: "Sidebar Palette overrides" },
});
