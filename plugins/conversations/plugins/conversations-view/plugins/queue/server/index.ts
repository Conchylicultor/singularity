import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationCreated } from "@plugins/conversations/server";
import { taskStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { handleReorder } from "./internal/handle-reorder";
import { handlePromote } from "./internal/handle-promote";
import { handleDemote } from "./internal/handle-demote";
import { handleStepDown } from "./internal/handle-step-down";
import { handleRerank } from "./internal/handle-rerank";
import { handlePin } from "./internal/handle-pin";
import { seedRankJob } from "./internal/seed-rank-job";
import { taskStatusRerankJob } from "./internal/task-status-rerank-job";
import { sweepGoneRanksJob } from "./internal/sweep-gone-ranks-job";
import { queueRanksResource } from "./internal/resource";
import { repairBlockedOrder } from "./internal/repair-blocked-order";
import {
  reorderQueue,
  promoteQueue,
  demoteQueue,
  stepDownQueue,
  rerankQueue,
  pinQueue,
} from "../core/endpoints";

export { conversationsQueue } from "./internal/tables";
export { queueRanksResource } from "./internal/resource";
export { seedRankJob } from "./internal/seed-rank-job";
export { lockDeck, rankForTop, rankForBottom, rankAfterN, rankAdjacentTo, rankAfterBlockers, endRank, findTaskIdForConversation, reseatGroupMembers, upsertRank, seatJoiningGroup, setGroupPinned } from "./internal/queue-ranks";

export default {
  description:
    "Stable-rank global queue. Ranks seeded once on creation (newest first). A user-set pin lifts a conversation's task group into its own section at the top.",
  contributions: [
    Resource.Declare(queueRanksResource),
    Trigger({ on: conversationCreated, do: seedRankJob, with: {}, oneShot: false }),
    // Task blocked/unblocked is a rank change with no conversation status change
    // behind it, so it needs its own trigger.
    Trigger({ on: taskStatusChanged, do: taskStatusRerankJob, with: {}, oneShot: false }),
  ],
  register: [seedRankJob, taskStatusRerankJob, sweepGoneRanksJob],
  httpRoutes: {
    [reorderQueue.route]:  handleReorder,
    [promoteQueue.route]:  handlePromote,
    [demoteQueue.route]:   handleDemote,
    [stepDownQueue.route]: handleStepDown,
    [rerankQueue.route]:   handleRerank,
    [pinQueue.route]:      handlePin,
  },
  onReady: repairBlockedOrder,
} satisfies ServerPluginDefinition;
