import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";
import { dynamicEnumField } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/core";
import { typographyGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(typographyGroup.schema).map(
    ([key, { label }]) => [key, textField({ default: "", label })]
  )
);

export const typographyConfig = defineConfig({
  fields: {
    preset: dynamicEnumField({ default: "default", label: "Typography preset" }),
    overrides: objectField({
      label: "Token overrides",
      subFields: {
        light: objectField({ label: "Light", subFields: tokenSubFields }),
        dark: objectField({ label: "Dark", subFields: tokenSubFields }),
      },
    }),
  },
});
