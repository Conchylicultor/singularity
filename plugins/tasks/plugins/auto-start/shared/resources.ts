import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
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

// Keyed query-resource contract: rows key on `parentId` (the side-table's PK).
// The server half is compiled from the drizzle declaration in
// `server/internal/resource.ts`; the wire shape stays `TaskAutoStartRow[]`.
export const taskAutoStartResource = queryResourceDescriptor<TaskAutoStartRow>(
  "tasks-auto-start",
  TaskAutoStartRowSchema,
  "parentId",
);
