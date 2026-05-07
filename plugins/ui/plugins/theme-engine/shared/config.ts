import { defineConfig } from "@plugins/config/shared";

export const themeEngineConfig = defineConfig({
  globalPreset: { default: "default", label: "Theme" },
});
