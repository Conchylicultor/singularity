import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

export const localBackupConfig = defineConfig({
  fields: {
    enabled: boolField({ default: true, label: "Enable local backup" }),
    keepLast: intField({
      default: 10,
      label: "Keep last N local backups",
      description: "Older backup directories are deleted automatically.",
    }),
  },
});
