// MIGRATION: views and schemas moved to tasks-core — this stub keeps existing
// internal imports compiling. Remove in Phase 3 once all consumers use tasks-core.
export {
  attempts,
  tasks,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  TaskSchema,
  TaskStatusSchema,
} from "@plugins/tasks-core/server/internal/schema";
export type {
  Attempt,
  AttemptStatus,
  Push,
  Task,
  TaskStatus,
} from "@plugins/tasks-core/server/internal/schema";
