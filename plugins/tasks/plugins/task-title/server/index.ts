import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  userTurnSent,
} from "@plugins/conversations/server";
import { taskTitleChanged } from "@plugins/tasks/plugins/tasks-core/server";
import {
  titleOnConversationCreatedJob,
  titleOnUserTurnSentJob,
} from "./internal/title-subscribers";
import { taskShortTitlesServed } from "./internal/short-title-resource";
import {
  shortTitleJob,
  shortTitleOnTitleChangedJob,
} from "./internal/short-title-job";
import {
  backfillShortTitlesJob,
  shortTitlesBackfillWarmup,
} from "./internal/short-title-backfill";

export {
  generateTaskTitle,
  scheduleTaskTitleUpdate,
  scheduleTaskTitleUpgrade,
  synthesiseTitleFallback,
} from "./internal/generate-title";

export default {
  description:
    "Haiku-backed task title generation. Upgrades uninformative titles asynchronously via event subscribers so task/conversation creation never blocks on the Claude CLI round-trip. Owns the tasks_ext_short_title side-table: a ≤3-word short title per task, regenerated on tasks.titleChanged and backfilled for recently active tasks.",
  register: [
    titleOnConversationCreatedJob,
    titleOnUserTurnSentJob,
    shortTitleJob,
    shortTitleOnTitleChangedJob,
    backfillShortTitlesJob,
    shortTitlesBackfillWarmup,
  ],
  contributions: [
    ...taskShortTitlesServed.declare,
    Trigger({
      on: conversationCreated,
      do: titleOnConversationCreatedJob,
      with: {},
      oneShot: false,
    }),
    Trigger({
      on: userTurnSent,
      do: titleOnUserTurnSentJob,
      with: {},
      oneShot: false,
    }),
    Trigger({
      on: taskTitleChanged,
      do: shortTitleOnTitleChangedJob,
      with: {},
      oneShot: false,
    }),
  ],
} satisfies ServerPluginDefinition;
