import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { TaskAutoStartRowSchema, type TaskAutoStartRow } from "../../shared/resources";
import { _tasksAutoStartExt } from "./tables";

export const tasksAutoStartResource = defineResource({
  key: "tasks-auto-start",
  mode: "push",
  schema: z.array(TaskAutoStartRowSchema),
  loader: async (): Promise<TaskAutoStartRow[]> => {
    const rows = await db.select().from(_tasksAutoStartExt);
    return rows.map((r) => ({
      parentId: r.parentId,
      autoStartAt: r.autoStartAt,
      autoStartModel: r.autoStartModel,
    }));
  },
});
