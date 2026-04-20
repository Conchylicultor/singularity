// MIGRATION shim: all schema/resource/rank/meta-task symbols now live in
// tasks-core. Re-exported here for any consumers that haven't been updated yet.
// Remove in Phase 3 once every consumer imports directly from tasks-core.
export {
  tasksResource,
  attemptsResource,
  pushesResource,
  CONVERSATIONS_META_TASK_ID,
  findNextRankUnder as nextRankUnder,
  TaskSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
} from "@plugins/tasks-core/server";
export type { Task, TaskStatus, Attempt, AttemptStatus, Push } from "@plugins/tasks-core/server";
