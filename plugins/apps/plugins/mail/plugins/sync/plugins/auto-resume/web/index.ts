import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { GmailReconnectResume } from "./components/gmail-reconnect-resume";

export default {
  description:
    "Auto-resumes Mail sync when the Gmail scope is (re)granted: an app-wide headless listener that POSTs the sync kick endpoint on the connect edge.",
  contributions: [Core.Root({ component: GmailReconnectResume })],
} satisfies PluginDefinition;
