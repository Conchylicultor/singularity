import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// One task's selected preprompt, stored in the `tasks_ext_preprompt`
// entity-extension table (1:1 per task), which `server/internal/tables.ts`
// builds from this shape.
export const taskPrepromptShape = defineExtensionShape({
  key: "taskId",
  fields: { prepromptId: textField() },
  wireTimestamps: ["updatedAt"],
});
export const TaskPrepromptSchema = taskPrepromptShape.schema;
export type TaskPreprompt = z.infer<typeof TaskPrepromptSchema>;

export const TaskPrepromptsPayloadSchema = z.record(
  z.string(),
  TaskPrepromptSchema,
);
export type TaskPrepromptsPayload = z.infer<typeof TaskPrepromptsPayloadSchema>;

export const taskPrepromptsResource = resourceDescriptor<TaskPrepromptsPayload>(
  "task-preprompts",
  TaskPrepromptsPayloadSchema,
  {},
);
