import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

export const actionBarConfig = defineConfig({
  fields: {
    enabled: boolField({
      default: true,
      label: "Action bar",
      description:
        "Show the global action bar in the tab bar, surfacing the main actions (Improve, Build, Screenshot, …). Collapses to a status icon that expands on hover; pin it to keep it expanded.",
    }),
  },
});
