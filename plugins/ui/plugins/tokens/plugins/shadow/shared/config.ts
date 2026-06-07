import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";

export const shadowConfig = defineConfig({
  scope: "app",
  fields: {
    preset: dynamicEnumField({ default: "default", label: "Shadow preset" }),
    overrides: objectField({
      label: "Shadow parameters",
      subFields: {
        color: textField({ default: "", label: "Color" }),
        opacity: textField({ default: "", label: "Opacity" }),
        blur: textField({ default: "", label: "Blur" }),
        spread: textField({ default: "", label: "Spread" }),
        offsetX: textField({ default: "", label: "Offset X" }),
        offsetY: textField({ default: "", label: "Offset Y" }),
      },
    }),
  },
});
