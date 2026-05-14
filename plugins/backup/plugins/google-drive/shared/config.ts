import { defineConfig } from "@plugins/config/core";

export const googleDriveBackupConfig = defineConfig({
  enabled: {
    default: false,
    label: "Enable Google Drive backup",
  },
  keepLast: {
    default: 10,
    label: "Keep last N Drive backups",
    description: "Older archives in the Drive folder are deleted automatically.",
  },
});
