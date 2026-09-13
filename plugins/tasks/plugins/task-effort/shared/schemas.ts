import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { parsedTextField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { StoredEffortSchema } from "@plugins/conversations/plugins/effort-provider/core";

// One task's thinking mode, stored in the `tasks_ext_effort` entity-extension
// table (1:1 per task), which `server/internal/tables.ts` builds from this
// shape. The stored schema is the tolerant one, so a level id that has since
// been renamed normalizes on read rather than reaching the registry lookup.
// `default` is only the wire default the field record requires — the column
// has no DB default, and an absent row means "no mode".
export const taskEffortShape = defineExtensionShape({
  key: "taskId",
  fields: {
    level: parsedTextField(StoredEffortSchema, { default: "high" }),
  },
  wireTimestamps: ["updatedAt"],
});
export const TaskEffortSchema = taskEffortShape.schema;
export type TaskEffort = z.infer<typeof TaskEffortSchema>;

export const TaskEffortsPayloadSchema = z.record(z.string(), TaskEffortSchema);
export type TaskEffortsPayload = z.infer<typeof TaskEffortsPayloadSchema>;

export const taskEffortsResource = resourceDescriptor<TaskEffortsPayload>(
  "task-efforts",
  TaskEffortsPayloadSchema,
  {},
);
