// MIGRATION: tables moved to tasks-core — this stub keeps existing internal
// imports compiling. Remove in Phase 3 once all consumers use tasks-core.
export { _attempts, _taskDependencies, _tasks, pushes } from "@plugins/tasks-core/server/internal/tables";
