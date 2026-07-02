import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  userTurnSent,
} from "@plugins/conversations/server";
import { taskStatusChanged, conversationStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { handleReorder } from "./internal/handle-reorder";
import { handlePromote } from "./internal/handle-promote";
import { handleDemote } from "./internal/handle-demote";
import { handleStepDown } from "./internal/handle-step-down";
import { handleRerank } from "./internal/handle-rerank";
import { seedRankJob } from "./internal/seed-rank-job";
import { pinRevalidateJob } from "./internal/pin-revalidate-job";
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
} from "../core/endpoints";

export { conversationsQueue } from "./internal/tables";
export { queueRanksResource } from "./internal/resource";
export { seedRankJob } from "./internal/seed-rank-job";
export { lockDeck, rankForTop, rankForBottom, rankAfterN, rankAdjacentTo, rankAfterBlockers, endRank, findTaskIdForConversation, reseatGroupMembers, upsertRank, rankJoiningGroup } from "./internal/queue-ranks";

export default {
  description:
    "Stable-rank global queue. Ranks seeded once on creation (newest first). Pinned top conversation persists as the user's current focus.",
  contributions: [
    Resource.Declare(queueRanksResource),
    Trigger({ on: conversationCreated, do: seedRankJob, with: {}, oneShot: false }),
    // Authoritative pin revalidation on any conversation status change. Replaces
    // both the old conversationTurnCompleted→validatePinJob trigger and the
    // queueRanks→conversationsLive cascade edge.
    Trigger({ on: conversationStatusChanged, do: pinRevalidateJob, with: {}, oneShot: false }),
    // Low-latency fast-path: sendTurn does not write status synchronously (the
    // flip to `working` lands on the next poller tick), so advance the pin off
    // the just-sent conversation immediately.
    Trigger({ on: userTurnSent, do: advancePinJob, with: {}, oneShot: false }),
    // Task blocked/unblocked changes pin validity (notBlocked) without any
    // conversation status change, so it is not covered by conversationStatusChanged.
    Trigger({ on: taskStatusChanged, do: taskStatusPinJob, with: {}, oneShot: false }),
  ],
  register: [seedRankJob, pinRevalidateJob, advancePinJob, taskStatusPinJob],
  httpRoutes: {
    [reorderQueue.route]:  handleReorder,
    [promoteQueue.route]:  handlePromote,
    [demoteQueue.route]:   handleDemote,
    [stepDownQueue.route]: handleStepDown,
    [rerankQueue.route]:   handleRerank,
  },
  onReady: repairBlockedOrder,
} satisfies ServerPluginDefinition;
