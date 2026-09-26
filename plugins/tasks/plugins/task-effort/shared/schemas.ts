import type { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
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

// Bounded POINT resource. The mode is 1:1 with its task, so the point identity
// IS the side-table's pk (`taskId`, stored as `parent_id`): one subscribed id
// names exactly one task's mode.
//
// Every consumer asks about ONE task and needs an exact answer — the launch
// option's picker both reads and writes this row — so `point` is the right bound
// rather than a window, which could silently render a set mode as "none". The
// change feed routes a write to a tuple iff the changed ids intersect its set,
// so setting one task's mode never sweeps the table.
//
// NOT preloaded: point resources hydrate post-mount (the recorded decision of
// the bounded working-set contract).
//
// The server half is compiled from the extension handle in
// `server/internal/resource.ts`; the wire shape is `TaskEffort[]`.
export const taskEffortsResource = pointQueryResourceDescriptor<TaskEffort>(
  "task-efforts",
  TaskEffortSchema,
  "taskId",
);
