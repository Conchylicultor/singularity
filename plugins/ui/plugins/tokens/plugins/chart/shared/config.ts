import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import { chartGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(chartGroup.schema).map(
    ([key, { label }]) => [key, textField({ default: "", label })]
  )
);

export const chartConfig = defineConfig({
  scope: "app",
  fields: {
    preset: dynamicEnumField({ default: "default", label: "Chart preset" }),
    overrides: objectField({
      label: "Token overrides",
      subFields: {
        light: objectField({ label: "Light", subFields: tokenSubFields }),
        dark: objectField({ label: "Dark", subFields: tokenSubFields }),
      },
    }),
  },
});
