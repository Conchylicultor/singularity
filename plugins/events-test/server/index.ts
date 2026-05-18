import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleCrashRecovery } from "./internal/crash-recovery";
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
} from "../shared/endpoints";

export default {
  id: "events-test",
  name: "Events Test",
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
  },
  register: [logPing, pinged],
} satisfies ServerPluginDefinition;
