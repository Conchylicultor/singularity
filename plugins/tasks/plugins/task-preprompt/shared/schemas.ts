import type { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
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

// Bounded POINT resource. The selection is 1:1 with its task, so the point
// identity IS the side-table's pk (`taskId`, stored as `parent_id`): one
// subscribed id names exactly one task's preprompt.
//
// Every consumer asks about ONE task and needs an exact answer — the launch
// option's picker both reads and writes this row — so `point` is the right bound
// rather than a window, which could silently render a selected preprompt as
// "None". The change feed routes a write to a tuple iff the changed ids
// intersect its set, so selecting one task's preprompt never sweeps the table.
//
// NOT bootCritical: point resources hydrate post-mount (the recorded decision of
// the bounded working-set contract).
//
// The server half is compiled from the extension handle in
// `server/internal/resource.ts`; the wire shape is `TaskPreprompt[]`.
export const taskPrepromptsResource =
  pointQueryResourceDescriptor<TaskPreprompt>(
    "task-preprompts",
    TaskPrepromptSchema,
    "taskId",
  );
