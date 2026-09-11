import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { DEFAULT_THEME_ID } from "./theme";

/**
 * A scope's ONE theme choice — the desktop's (the base document) or one app's
 * (`@app/<id>/theme.jsonc`). This is the document the theme painter reads: a
 * scope stores which `Theme` paints it, never a setting per token group, so an
 * app cannot own part of a theme and inherit the rest from the desktop.
 *
 * Its own name (`theme`, not `config`) so the per-group documents written under
 * the old model become orphans the orphan audit lists, rather than stale-hash
 * conflicts against a reshaped schema.
 */
export const themeSelectionConfig = defineConfig({
  name: "theme",
  scope: "app",
  fields: {
    theme: dynamicEnumField({ default: DEFAULT_THEME_ID, label: "Theme" }),
    colorMode: enumField({
      default: "system",
      options: ["light", "dark", "system"],
      label: "Color mode",
    }),
  },
});
