import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import type { z } from "zod";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { parsedTextField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import {
  DEFAULT_MODEL_CHOICE,
  StoredModelChoiceSchema,
} from "@plugins/conversations/plugins/model-provider/core";

// One task's auto-start marker, stored in the `tasks_ext_auto_start`
// entity-extension table (1:1 per task), which `server/internal/tables.ts`
// builds from this shape.
export const taskAutoStartShape = defineExtensionShape({
  key: "taskId",
  fields: {
    autoStartAt: dateField(),
    // A model CHOICE — a family ("opus", resolved to its newest version when
    // the task launches) or a pinned version. The tolerant schema, not the
    // strict one: model ids get renamed and stored rows outlive them.
    // Normalizing at the COLUMN is what reaches the server-side readers too, and
    // on the wire an unknown stored value normalizes instead of rejecting the
    // row, which would blank the whole resource. `default` is only the wire
    // default the field record requires; the column has no DB default.
    autoStartModel: parsedTextField(StoredModelChoiceSchema, {
      default: DEFAULT_MODEL_CHOICE,
    }),
  },
});
export const TaskAutoStartRowSchema = taskAutoStartShape.schema;
export type TaskAutoStartRow = z.infer<typeof TaskAutoStartRowSchema>;

// Bounded POINT resource. The marker is 1:1 with its task, so the point identity
// IS the side-table's pk (`taskId`, stored as `parent_id`): one subscribed id
// names exactly one task's marker.
//
// Every consumer asks about ONE task and needs an exact answer — the launch
// option's select control both reads and writes this row — so `point` is the
// right bound rather than a window, which could silently render an armed task as
// "Off". Subscribers name the task they render: a task row asks for its own id,
// the open task's Prompt card for that task's id. The change feed routes an
// arm/disarm to a tuple iff the changed ids intersect its set, so arming one task
// never sweeps the table.
//
// NOT bootCritical: point resources hydrate post-mount (the recorded decision of
// the bounded working-set contract), which is what this resource already did.
//
// The server half is compiled from the extension handle in
// `server/internal/resource.ts`; the wire shape stays `TaskAutoStartRow[]`.
export const taskAutoStartResource =
  pointQueryResourceDescriptor<TaskAutoStartRow>(
    "tasks-auto-start",
    TaskAutoStartRowSchema,
    "taskId",
  );
