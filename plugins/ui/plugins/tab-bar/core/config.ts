import { defineConfig } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";

export const tabBarConfig = defineConfig({
  fields: {
    variant: dynamicEnumField({ default: "chip", label: "Tab bar variant" }),
  },
});
