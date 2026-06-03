import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const floatingBarConfig = defineConfig({
  fields: {
    enabled: boolField({
      default: true,
      label: "Floating action bar",
      description:
        "Show a floating action bar in the top-right of every app except the Agent Manager (which already has the toolbar), surfacing the main actions (Improve, Build, Screenshot, …). Collapses to a status icon; expands on hover.",
    }),
  },
});
