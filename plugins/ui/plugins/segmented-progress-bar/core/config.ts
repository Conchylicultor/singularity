import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";

export const segmentedProgressBarConfig = defineConfig({
  fields: {
    variant: dynamicEnumField({ default: "segmented", label: "Progress bar variant" }),
  },
});
