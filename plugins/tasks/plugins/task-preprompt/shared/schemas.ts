import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const TaskPrepromptSchema = z.object({
  taskId: z.string(),
  prepromptId: z.string(),
  updatedAt: z.coerce.date(),
});
export type TaskPreprompt = z.infer<typeof TaskPrepromptSchema>;

export const TaskPrepromptsPayloadSchema = z.record(z.string(), TaskPrepromptSchema);
export type TaskPrepromptsPayload = z.infer<typeof TaskPrepromptsPayloadSchema>;

export const taskPrepromptsResource = resourceDescriptor<TaskPrepromptsPayload>(
  "task-preprompts",
  TaskPrepromptsPayloadSchema,
  {},
);
