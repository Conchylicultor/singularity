import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";

export const TaskAutoStartRowSchema = z.object({
  parentId: z.string(),
  autoStartAt: z.coerce.date(),
  autoStartModel: ConversationModelSchema,
});
export type TaskAutoStartRow = z.infer<typeof TaskAutoStartRowSchema>;

export const taskAutoStartResource = resourceDescriptor<TaskAutoStartRow[]>(
  "tasks-auto-start",
  z.array(TaskAutoStartRowSchema),
  [],
);
