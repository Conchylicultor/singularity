import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { Trigger } from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  conversationTurnCompleted,
} from "@plugins/conversations/server";
import { handleReorder } from "./internal/handle-reorder";
import { handlePromote } from "./internal/handle-promote";
import { handleDemote } from "./internal/handle-demote";
import { handleStepDown } from "./internal/handle-step-down";
import { handleRerank } from "./internal/handle-rerank";
import { seedRankJob } from "./internal/seed-rank-job";
import { queueRanksResource } from "./internal/resource";

export { conversationsQueue } from "./internal/tables";
export { queueRanksResource } from "./internal/resource";
export { seedRankJob } from "./internal/seed-rank-job";
export { lockDeck, rankForTop, rankForBottom, rankAfterN, rankAdjacentTo, rankAfterBlockers, endRank, positionTwoRank } from "./internal/queue-ranks";

export default {
  id: "conversations-queue",
  name: "Conversations Queue",
  description:
    "Server side of the global Anki-style conversations queue. Owns the conversations_ext_queue side-table via the entity-extensions primitive and seeds rank on conversationCreated + conversationTurnCompleted.",
  contributions: [
    Resource.Declare(queueRanksResource),
    Trigger({ on: conversationCreated, do: seedRankJob, with: {}, oneShot: false }),
    Trigger({ on: conversationTurnCompleted, do: seedRankJob, with: {}, oneShot: false }),
  ],
  register: [seedRankJob],
  httpRoutes: {
    "POST /api/conversations-queue/reorder": handleReorder,
    "POST /api/conversations-queue/promote": handlePromote,
    "POST /api/conversations-queue/demote": handleDemote,
    "POST /api/conversations-queue/step-down": handleStepDown,
    "POST /api/conversations-queue/rerank": handleRerank,
  },
} satisfies ServerPluginDefinition;
