import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
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
      // No normalize here: the field tolerates legacy/unknown on parse via StoredModelSchema.
      autoStartModel: r.autoStartModel,
    }));
  },
});
