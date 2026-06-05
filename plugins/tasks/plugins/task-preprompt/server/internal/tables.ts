import { text } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Per-task selected preprompt. Stores the config list-item id (not the text),
// so editing the preprompt in the config updates every task that references it.
export const tasksPreprompt = defineExtension(_tasks, "preprompt", {
  prepromptId: text("preprompt_id").notNull(),
});
export const _tasksPrepromptExt = tasksPreprompt.table;
