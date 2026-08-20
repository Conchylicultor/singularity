import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
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

// Bounded POINT resource. The marker is 1:1 with its task, so the point identity
// IS the side-table's pk (`parent_id` = the task id): one subscribed id names
// exactly one task's marker.
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
// The server half is compiled from the drizzle declaration in
// `server/internal/resource.ts`; the wire shape stays `TaskAutoStartRow[]`.
export const taskAutoStartResource =
  pointQueryResourceDescriptor<TaskAutoStartRow>(
    "tasks-auto-start",
    TaskAutoStartRowSchema,
    "parentId",
  );
