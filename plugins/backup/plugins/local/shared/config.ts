import { defineConfig } from "@plugins/config/core";

export const localBackupConfig = defineConfig({
  enabled: { default: true, label: "Enable local backup" },
  keepLast: {
    default: 10,
    label: "Keep last N local backups",
    description: "Older backup directories are deleted automatically.",
  },
});
