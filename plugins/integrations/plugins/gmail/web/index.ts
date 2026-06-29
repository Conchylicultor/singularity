import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2, useConfig } from "@plugins/config_v2/web";
import { Auth } from "@plugins/auth/web";
import { gmailConfig } from "../shared/config";
import { GMAIL_SCOPES } from "../shared/scopes";

export default {
  description: "Gmail access toggle and Google scope requirement.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: gmailConfig }),
    Auth.ScopeRequirement({
      providerId: "google",
      scopes: [...GMAIL_SCOPES],
      reason: "Read, send, and manage Gmail messages",
      useEnabled: () => useConfig(gmailConfig).enabled,
    }),
  ],
} satisfies PluginDefinition;
