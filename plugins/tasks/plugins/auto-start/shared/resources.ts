import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";
import { StoredModelSchema } from "@plugins/conversations/plugins/model-provider/core";

export const TaskAutoStartRowSchema = z.object({
  parentId: z.string(),
  autoStartAt: z.coerce.date(),
  // Tolerant by construction (see StoredModelSchema): a legacy/unknown stored model
  // normalizes instead of rejecting the row, which would blank the whole resource.
  autoStartModel: StoredModelSchema,
});
export type TaskAutoStartRow = z.infer<typeof TaskAutoStartRowSchema>;

export const taskAutoStartResource = resourceDescriptor<TaskAutoStartRow[]>(
  "tasks-auto-start",
  z.array(TaskAutoStartRowSchema),
  [],
);
