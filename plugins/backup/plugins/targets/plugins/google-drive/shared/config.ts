import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

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
