import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

export const secretsSourceConfig = defineConfig({
  fields: {
    enabled: boolField({ default: true, label: "Back up secrets" }),
  },
});
