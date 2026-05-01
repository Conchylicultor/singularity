import type { ServerPluginDefinition } from "@server/types";
import { handleReorder } from "./internal/handle-reorder";
import { backfillRanks } from "./internal/backfill-ranks";

export default {
  id: "conversations-queue",
  name: "Conversations Queue",
  description:
    "Server side of the global Anki-style conversations queue: reorder route + onReady backfill of ranks for legacy rows.",
  httpRoutes: {
    "POST /api/conversations-queue/reorder": handleReorder,
  },
  onReady: backfillRanks,
} satisfies ServerPluginDefinition;
