import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import { richTextPaletteGroup } from "./group";

const tokenSubFields = Object.fromEntries(
  Object.entries(richTextPaletteGroup.schema).map(([key, { label }]) => [
    key,
    textField({ default: "", label }),
  ]),
);

/**
 * Config descriptor required by every `ThemeEngine.TokenGroup` (the injector
 * reads `preset` + `overrides`). The palette is closed (single preset, no
 * picker), so `preset` is a fixed single-value enum and `overrides` are
 * effectively unused — but the descriptor keeps the same shape as the other
 * token groups so the pipeline is uniform.
 */
export const richTextPaletteConfig = defineConfig({
  scope: "app",
  fields: {
    preset: enumField({
      default: "default",
      label: "Rich-text palette",
      options: [{ value: "default", label: "Default" }],
    }),
    overrides: objectField({
      label: "Token overrides",
      subFields: {
        light: objectField({ label: "Light", subFields: tokenSubFields }),
        dark: objectField({ label: "Dark", subFields: tokenSubFields }),
      },
    }),
  },
});
