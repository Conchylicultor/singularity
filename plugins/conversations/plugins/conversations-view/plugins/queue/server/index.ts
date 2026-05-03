import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  conversationTurnCompleted,
} from "@plugins/conversations/server";
import { handleReorder } from "./internal/handle-reorder";
import { handlePromote } from "./internal/handle-promote";
import { handleDemote } from "./internal/handle-demote";
import { handleStepDown } from "./internal/handle-step-down";
import { seedRankJob } from "./internal/seed-rank-job";
import { queueRanksResource } from "./internal/resource";

export { _conversationsExtQueue } from "./internal/tables";
export { queueRanksResource } from "./internal/resource";
export { seedRankJob } from "./internal/seed-rank-job";
export { rankForTop, rankForBottom, rankAfterN, rankAdjacentTo, endRank, positionTwoRank } from "./internal/queue-ranks";

export default {
  id: "conversations-queue",
  name: "Conversations Queue",
  description:
    "Server side of the global Anki-style conversations queue. Owns the conversations_ext_queue side-table via the entity-extensions primitive and seeds rank on conversationCreated + conversationTurnCompleted.",
  resources: [queueRanksResource],
  register: [seedRankJob],
  httpRoutes: {
    "POST /api/conversations-queue/reorder": handleReorder,
    "POST /api/conversations-queue/promote": handlePromote,
    "POST /api/conversations-queue/demote": handleDemote,
    "POST /api/conversations-queue/step-down": handleStepDown,
  },
  onReady: async () => {
    await deleteTriggersFor(seedRankJob);
    await trigger({
      on: conversationCreated,
      do: seedRankJob,
      with: {},
      oneShot: false,
    });
    await trigger({
      on: conversationTurnCompleted,
      do: seedRankJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
