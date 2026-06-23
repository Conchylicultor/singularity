import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  TaskEffortsPayloadSchema,
  type TaskEffortsPayload,
} from "../../shared/schemas";
import { tasksEffort } from "./tables";

const t = tasksEffort.table;

export const taskEffortsResource = defineResource<TaskEffortsPayload>({
  key: "task-efforts",
  mode: "push",
  schema: TaskEffortsPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        taskId: t.parentId,
        level: t.level,
        updatedAt: t.updatedAt,
      })
      .from(t);
    const out: TaskEffortsPayload = {};
    for (const r of rows) out[r.taskId] = r;
    return out;
  },
});
