import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/core";
import { enumField } from "@plugins/config_v2/plugins/fields/plugins/enum/core";

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
