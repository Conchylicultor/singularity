import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2, useConfig } from "@plugins/config_v2/web";
import { Auth } from "@plugins/auth/web";
import { gmailConfig } from "../shared/config";
import { GMAIL_SCOPES, GOOGLE_PROVIDER_ID } from "../core";

export {
  useGmailAccess,
  type GmailAccess,
  type GmailAccessBlocker,
} from "./internal/use-gmail-access";
export {
  GmailAccessAction,
  GMAIL_BLOCKER_BODY,
} from "./components/gmail-access-action";

export default {
  description:
    "Gmail access toggle, Google scope requirement, and the shared 'fix my Gmail connection' affordance consumers render in place of routing the user to Settings.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: gmailConfig }),
    Auth.ScopeRequirement({
      providerId: GOOGLE_PROVIDER_ID,
      scopes: [...GMAIL_SCOPES],
      reason: "Read, send, and manage Gmail messages",
      useEnabled: () => useConfig(gmailConfig).enabled,
    }),
  ],
} satisfies PluginDefinition;
