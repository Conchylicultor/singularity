import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { objectField } from "@plugins/config_v2/plugins/fields/plugins/object/core";
import { dynamicEnumField } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/core";
import { densityGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(densityGroup.schema).map(
    ([key, { label }]) => [key, textField({ default: "", label })]
  )
);

export const densityConfig = defineConfig({
  fields: {
    preset: dynamicEnumField({ default: "comfortable", label: "Density preset" }),
    overrides: objectField({
      label: "Token overrides",
      subFields: {
        light: objectField({ label: "Light", subFields: tokenSubFields }),
        dark: objectField({ label: "Dark", subFields: tokenSubFields }),
      },
    }),
  },
});
