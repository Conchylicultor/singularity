import type { ServerPluginDefinition } from "@server/types";
import { handleReorder } from "./internal/handle-reorder";
import { handlePromote } from "./internal/handle-promote";
import { handleDemote } from "./internal/handle-demote";
import { backfillRanks } from "./internal/backfill-ranks";

export default {
  id: "conversations-queue",
  name: "Conversations Queue",
  description:
    "Server side of the global Anki-style conversations queue: reorder route + onReady backfill of ranks for legacy rows.",
  httpRoutes: {
    "POST /api/conversations-queue/reorder": handleReorder,
    "POST /api/conversations-queue/promote": handlePromote,
    "POST /api/conversations-queue/demote": handleDemote,
  },
  onReady: backfillRanks,
} satisfies ServerPluginDefinition;
