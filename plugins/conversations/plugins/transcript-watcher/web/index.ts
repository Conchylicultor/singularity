import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Reports } from "@plugins/reports/web";
import { ForeignSessionSummary } from "./components/foreign-session-summary";

export default {
  description:
    "Foreign-session report renderer: a one-line Debug, Reports summary for the conversation-foreign-session kind — which conversation holds a session id that belongs to another, and how it was seen.",
  contributions: [
    Reports.KindView({
      match: "conversation-foreign-session",
      component: ForeignSessionSummary,
    }),
  ],
} satisfies PluginDefinition;
