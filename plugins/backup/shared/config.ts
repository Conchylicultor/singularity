import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const backupConfig = defineConfig({
  fields: {
    periodicCron: textField({
      default: "0 3 * * *",
      label: "Backup schedule (cron)",
      description:
        "5-field crontab (m h dom mon dow, UTC) for automatic backups. Empty = manual only. Takes effect on the next server restart.",
    }),
  },
});
