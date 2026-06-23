import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { StoredEffortSchema } from "@plugins/conversations/plugins/effort-provider/core";

export const TaskEffortSchema = z.object({
  taskId: z.string(),
  level: StoredEffortSchema,
  updatedAt: z.coerce.date(),
});
export type TaskEffort = z.infer<typeof TaskEffortSchema>;

export const TaskEffortsPayloadSchema = z.record(z.string(), TaskEffortSchema);
export type TaskEffortsPayload = z.infer<typeof TaskEffortsPayloadSchema>;

export const taskEffortsResource = resourceDescriptor<TaskEffortsPayload>(
  "task-efforts",
  TaskEffortsPayloadSchema,
  {},
);
