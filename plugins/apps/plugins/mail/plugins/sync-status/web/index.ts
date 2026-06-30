import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Mail } from "@plugins/apps/plugins/mail/plugins/shell/web";
import { MailSyncBanner } from "./components/mail-sync-banner";

export default {
  description:
    "Mail sync-status banner: a full-width strip above the mailbox surface that surfaces in-progress syncs and classified sync failures (warning/error) with remediation copy and actions (reconnect, enable API, retry). Silent when the mailbox is healthy.",
  contributions: [
    Mail.Banner({ id: "sync-status", component: MailSyncBanner }),
  ],
} satisfies PluginDefinition;
