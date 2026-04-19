// Schema surface — order matters: tables.ts is a leaf, so re-exporting from
// it first lets cross-plugin code that imports tables (FK targets) avoid
// pulling in the views, which depend on other plugins' schemas and would
// otherwise create initialization cycles.
export { _attempts, _tasks, pushes } from "./internal/tables";
export {
  attempts,
  tasks,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  TaskSchema,
  TaskStatusSchema,
} from "./internal/schema";
export type { Attempt, AttemptStatus, Push, Task, TaskStatus } from "./internal/schema";

export {
  attemptsResource,
  pushesResource,
  tasksResource,
} from "./internal/resources";
export { CONVERSATIONS_META_TASK_ID } from "./internal/meta-conversations";
export { nextRankUnder } from "./internal/rank";
