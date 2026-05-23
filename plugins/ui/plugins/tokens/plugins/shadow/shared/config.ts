import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";

export const shadowConfig = defineConfig({
  fields: {
    preset: textField({ default: "default", label: "Shadow preset" }),
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
