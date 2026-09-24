import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { taskSourceUrlShape } from "../../core";

export const tasksSourceUrl = defineExtension(
  _tasks,
  "source_url",
  taskSourceUrlShape,
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksSourceUrlExt = tasksSourceUrl.table;
