import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { dynamicEnumField } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";
import { categoricalGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(categoricalGroup.schema).map(
    ([key, { label }]) => [key, textField({ default: "", label })]
  )
);

export const categoricalConfig = defineConfig({
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
