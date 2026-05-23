import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const segmentedProgressBarConfig = defineConfig({
  fields: {
    variant: textField({ default: "dots", label: "Progress bar variant" }),
  },
});
