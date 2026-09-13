import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { taskPrepromptShape } from "../../shared/schemas";

// Per-task selected preprompt. Stores the config list-item id (not the text),
// so editing the preprompt in the config updates every task that references it.
export const tasksPreprompt = defineExtension(
  _tasks,
  "preprompt",
  taskPrepromptShape,
);
export const _tasksPrepromptExt = tasksPreprompt.table;
