import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/core";

export const themeEngineConfig = defineConfig({
  fields: {
    globalPreset: dynamicEnumField({ default: "default", label: "Theme" }),
  },
});
