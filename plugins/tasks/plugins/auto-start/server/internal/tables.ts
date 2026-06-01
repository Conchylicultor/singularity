import { text, timestamp } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

export const tasksAutoStart = defineExtension(_tasks, "auto_start", {
  autoStartAt: timestamp("auto_start_at", { withTimezone: true }).notNull(),
  autoStartModel: text("auto_start_model").$type<ConversationModel>().notNull(),
});
export const _tasksAutoStartExt = tasksAutoStart.table;
