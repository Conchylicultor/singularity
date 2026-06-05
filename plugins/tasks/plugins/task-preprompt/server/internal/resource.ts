import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  TaskPrepromptsPayloadSchema,
  type TaskPrepromptsPayload,
} from "../../shared/schemas";
import { tasksPreprompt } from "./tables";

const t = tasksPreprompt.table;

export const taskPrepromptsResource = defineResource<TaskPrepromptsPayload>({
  key: "task-preprompts",
  mode: "push",
  schema: TaskPrepromptsPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        taskId: t.parentId,
        prepromptId: t.prepromptId,
        updatedAt: t.updatedAt,
      })
      .from(t);
    const out: TaskPrepromptsPayload = {};
    for (const r of rows) out[r.taskId] = r;
    return out;
  },
});
