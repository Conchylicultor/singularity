import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

export const themeEngineConfig = defineConfig({
  scope: "app",
  fields: {
    globalPreset: dynamicEnumField({ default: "default", label: "Theme" }),
    colorMode: enumField({
      default: "system",
      options: ["light", "dark", "system"],
      label: "Color mode",
    }),
  },
});
