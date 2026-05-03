import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { z } from "zod";

export const TaskAutoStartRowSchema = z.object({
  parentId: z.string(),
  autoStartAt: z.coerce.date(),
  autoStartModel: z.enum(["opus", "sonnet"]),
});
export type TaskAutoStartRow = z.infer<typeof TaskAutoStartRowSchema>;

export const taskAutoStartResource = resourceDescriptor<TaskAutoStartRow[]>(
  "tasks-auto-start",
  z.array(TaskAutoStartRowSchema),
);
