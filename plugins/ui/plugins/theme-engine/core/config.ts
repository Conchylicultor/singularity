import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const themeEngineConfig = defineConfig({
  fields: {
    globalPreset: textField({ default: "default", label: "Theme" }),
  },
});
