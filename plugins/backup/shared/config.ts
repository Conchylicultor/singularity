import { defineConfig } from "@plugins/config_v2/core";
import { intField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const backupConfig = defineConfig({
  fields: {
    periodicIntervalHours: intField({
      default: 24,
      label: "Backup interval (hours)",
      description: "How often to run automatic backups. 0 = manual only.",
    }),
  },
});
