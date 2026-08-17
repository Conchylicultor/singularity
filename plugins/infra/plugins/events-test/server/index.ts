import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleCrashRecovery } from "./internal/crash-recovery";
import { cronDedupProbe, handleCronDedup } from "./internal/cron-dedup";
import { handleQueueLockNoSteal } from "./internal/queue-lock-no-steal";
import { handleSerialQueue } from "./internal/serial-queue";
import { serialProbe } from "./internal/serial-job";
import {
  handleDeleteTargeting,
  handleDeleteTrigger,
  handleDirectEnqueue,
  handleEmit,
  handleListTriggers,
  handleLog,
  handleReset,
  handleSubscribe,
  handleWaitIdle,
} from "./internal/handle";
import { logPing } from "./internal/log-job";
import { pinged } from "./internal/tables";
import {
  subscribeEventsTest,
  emitEventsTest,
  directEnqueueEventsTest,
  getEventsTestLog,
  resetEventsTest,
  deleteEventsTestTrigger,
  deleteEventsTestTargeting,
  listEventsTestTriggers,
  waitEventsTestIdle,
  crashRecoveryEventsTest,
  serialQueueEventsTest,
  queueLockNoStealEventsTest,
  cronDedupEventsTest,
} from "../shared/endpoints";

export default {
  description: "Dummy plugin exercising the events and jobs APIs end-to-end.",
  httpRoutes: {
    [subscribeEventsTest.route]: handleSubscribe,
    [emitEventsTest.route]: handleEmit,
    [directEnqueueEventsTest.route]: handleDirectEnqueue,
    [getEventsTestLog.route]: handleLog,
    [resetEventsTest.route]: handleReset,
    [deleteEventsTestTrigger.route]: handleDeleteTrigger,
    [deleteEventsTestTargeting.route]: handleDeleteTargeting,
    [listEventsTestTriggers.route]: handleListTriggers,
    [waitEventsTestIdle.route]: handleWaitIdle,
    [crashRecoveryEventsTest.route]: handleCrashRecovery,
    [serialQueueEventsTest.route]: handleSerialQueue,
    [queueLockNoStealEventsTest.route]: handleQueueLockNoSteal,
    [cronDedupEventsTest.route]: handleCronDedup,
  },
  register: [logPing, serialProbe, cronDedupProbe, pinged],
} satisfies ServerPluginDefinition;
