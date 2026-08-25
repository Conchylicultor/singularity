import { timestamp } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import { StoredModelSchema } from "@plugins/conversations/plugins/model-provider/core";

export const tasksAutoStart = defineExtension(_tasks, "auto_start", {
  autoStartAt: timestamp("auto_start_at", { withTimezone: true }).notNull(),
  // The tolerant schema, not the strict one: model ids get renamed and stored
  // rows outlive them. Normalizing at the COLUMN is what reaches the server-side
  // readers too — the launch job looks this id up in MODEL_REGISTRY, and the
  // live-state guard it used to rely on only ever protected the browser.
  autoStartModel: parsedText("auto_start_model", StoredModelSchema).notNull(),
});
export const _tasksAutoStartExt = tasksAutoStart.table;
