import { defineConfig } from "@plugins/config/core";

export const backupConfig = defineConfig({
  periodicIntervalHours: {
    default: 24,
    label: "Backup interval (hours)",
    description: "How often to run automatic backups. 0 = manual only.",
  },
});
