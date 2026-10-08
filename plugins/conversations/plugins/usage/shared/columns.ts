import { z } from "zod";
import { liveColumns } from "@plugins/network/plugins/live/core";
import { liveNumber } from "@plugins/network/plugins/live/plugins/filter/core";
import {
  allConversations,
  conversationHistory,
} from "@plugins/conversations/plugins/all-conversations/core";

// The usage totals as contributed columns of both conversation lists: every row
// carries them under `$columns.usage`, and each list sorts and filters by them
// server-side. Served from the `conversations_ext_usage` extension (LEFT, 1:1),
// whose literal defaults make a conversation with no usage row read 0.
// One handle per collection — a handle belongs to the collection it names.
const spec = {
  row: z.object({
    costUsd: z.number(),
    tokens: z.number(),
    agentCount: z.number(),
  }),
  filterable: {
    costUsd: liveNumber(),
    tokens: liveNumber(),
    agentCount: liveNumber(),
  },
  sortable: ["costUsd", "tokens", "agentCount"],
} as const;

/** The usage columns of the All-conversations pane (`conversations.all`). */
export const allConversationsUsage = liveColumns(
  allConversations,
  "usage",
  spec,
);

/** The usage columns of the sidebar History list (`conversations.history`). */
export const conversationHistoryUsage = liveColumns(
  conversationHistory,
  "usage",
  spec,
);
