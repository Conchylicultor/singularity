import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import { categoricalGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(categoricalGroup.schema).map(
    ([key, { label }]) => [key, textField({ default: "", label })]
  )
);

export const categoricalConfig = defineConfig({
  scope: "app",
  fields: {
    preset: dynamicEnumField({ default: "default", label: "Categorical preset" }),
    overrides: objectField({
      label: "Token overrides",
      subFields: {
        light: objectField({ label: "Light", subFields: tokenSubFields }),
        dark: objectField({ label: "Dark", subFields: tokenSubFields }),
      },
    }),
  },
});
