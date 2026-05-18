import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  conversationTurnCompleted,
  userTurnSent,
} from "@plugins/conversations/server";
import { taskStatusChanged } from "@plugins/tasks-core/server";
import { handleReorder } from "./internal/handle-reorder";
import { handlePromote } from "./internal/handle-promote";
import { handleDemote } from "./internal/handle-demote";
import { handleStepDown } from "./internal/handle-step-down";
import { handleRerank } from "./internal/handle-rerank";
import { seedRankJob } from "./internal/seed-rank-job";
import { validatePinJob } from "./internal/validate-pin-job";
import { advancePinJob } from "./internal/advance-pin-job";
import { taskStatusPinJob } from "./internal/task-status-pin-job";
import { queueRanksResource } from "./internal/resource";
import { repairBlockedOrder } from "./internal/repair-blocked-order";
import {
  reorderQueue,
  promoteQueue,
  demoteQueue,
  stepDownQueue,
  rerankQueue,
} from "../shared/endpoints";

export { conversationsQueue } from "./internal/tables";
export { queueRanksResource } from "./internal/resource";
export { seedRankJob } from "./internal/seed-rank-job";
export { lockDeck, rankForTop, rankForBottom, rankAfterN, rankAdjacentTo, rankAfterBlockers, endRank, findTaskIdForConversation, reseatGroupMembers, upsertRank, rankJoiningGroup } from "./internal/queue-ranks";

export default {
  id: "conversations-queue",
  name: "Conversations Queue",
  description:
    "Stable-rank global queue. Ranks seeded once on creation (newest first). Pinned top conversation persists as the user's current focus.",
  contributions: [
    Resource.Declare(queueRanksResource),
    Trigger({ on: conversationCreated, do: seedRankJob, with: {}, oneShot: false }),
    Trigger({ on: conversationTurnCompleted, do: validatePinJob, with: {}, oneShot: false }),
    Trigger({ on: userTurnSent, do: advancePinJob, with: {}, oneShot: false }),
    Trigger({ on: taskStatusChanged, do: taskStatusPinJob, with: {}, oneShot: false }),
  ],
  register: [seedRankJob, validatePinJob, advancePinJob, taskStatusPinJob],
  httpRoutes: {
    [reorderQueue.route]:  handleReorder,
    [promoteQueue.route]:  handlePromote,
    [demoteQueue.route]:   handleDemote,
    [stepDownQueue.route]: handleStepDown,
    [rerankQueue.route]:   handleRerank,
  },
  onReady: repairBlockedOrder,
} satisfies ServerPluginDefinition;
