import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AllConversationsFields } from "@plugins/conversations/plugins/all-conversations/web";
import { HistoryFields } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/plugins/history/web";
import {
  AllConversationsUsageFields,
  HistoryUsageFields,
} from "./components/usage-fields";

export default {
  description:
    "Cost, Tokens and Agents fields on the conversation lists (All-conversations, sidebar History), bound to the lists' `usage` columns so they sort and filter server-side.",
  contributions: [
    AllConversationsFields({
      id: "usage",
      section: null,
      component: AllConversationsUsageFields,
    }),
    HistoryFields({
      id: "usage",
      section: null,
      component: HistoryUsageFields,
    }),
  ],
} satisfies PluginDefinition;
