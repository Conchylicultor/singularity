import { defineConfig } from "@plugins/config_v2/core";
import { boolField, intField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const googleDriveBackupConfig = defineConfig({
  fields: {
    enabled: boolField({
      default: false,
      label: "Enable Google Drive backup",
    }),
    keepLast: intField({
      default: 10,
      label: "Keep last N Drive backups",
      description: "Older archives in the Drive folder are deleted automatically.",
    }),
  },
});
