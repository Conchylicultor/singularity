import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";
import { shapeGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(shapeGroup.schema).map(
    ([key, { label }]) => [key, textField({ default: "", label })]
  )
);

export const shapeConfig = defineConfig({
  fields: {
    preset: textField({ default: "default", label: "Shape preset" }),
    overrides: objectField({
      label: "Token overrides",
      subFields: {
        light: objectField({ label: "Light", subFields: tokenSubFields }),
        dark: objectField({ label: "Dark", subFields: tokenSubFields }),
      },
    }),
  },
});
