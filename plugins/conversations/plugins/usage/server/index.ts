import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { LiveColumns } from "@plugins/network/plugins/live/server";
import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";
import {
  allConversationsUsageServed,
  conversationHistoryUsageServed,
} from "./internal/columns";
import {
  usageBackfillJob,
  usageBackfillWarmup,
  usageRepriceJob,
  usageSyncJob,
} from "./internal/jobs";
import { startLiveUsage, stopLiveUsage } from "./internal/live";
import { _conversationUsageFiles } from "./internal/tables";

export default {
  description:
    "Per-conversation usage — cost, tokens and launched sub-agents — counted incrementally from the transcripts (the anchored session chain plus every sub-agent), stored in conversations_ext_usage and served as the conversation lists' `usage` columns.",
  register: [
    usageSyncJob,
    usageBackfillJob,
    usageRepriceJob,
    usageBackfillWarmup,
  ],
  contributions: [
    LiveColumns.Serve(allConversationsUsageServed),
    LiveColumns.Serve(conversationHistoryUsageServed),
    ExcludeFromChangeFeed({
      table: _conversationUsageFiles,
      reason:
        "Scan state rewritten on every transcript append; no collection reads it — the lists read the totals in conversations_ext_usage.",
    }),
  ],
  onReady: () => {
    startLiveUsage();
  },
  onShutdown: () => {
    stopLiveUsage();
  },
} satisfies ServerPluginDefinition;
