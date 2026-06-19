import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2, useConfig } from "@plugins/config_v2/web";
import { Auth } from "@plugins/auth/web";
import { googleDriveBackupConfig } from "../shared/config";
import { GOOGLE_DRIVE_SCOPES } from "../shared/scopes";

export default {
  description: "Config UI for Google Drive backup target.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: googleDriveBackupConfig }),
    Auth.ScopeRequirement({
      providerId: "google",
      scopes: [...GOOGLE_DRIVE_SCOPES],
      reason: "Back up to Google Drive",
      useEnabled: () => useConfig(googleDriveBackupConfig).enabled,
    }),
  ],
} satisfies PluginDefinition;
