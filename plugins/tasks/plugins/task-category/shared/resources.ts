import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

// One row per categorized task. `category` is the contributed registry id
// (system-set only — no user picker).
export const TaskCategoryRowSchema = z.object({
  parentId: z.string(),
  category: z.string(),
});
export type TaskCategoryRow = z.infer<typeof TaskCategoryRowSchema>;

// Keyed query-resource contract: rows key on `parentId` (the side-table PK). The
// server half is compiled from the drizzle declaration in
// `server/internal/resource.ts` (default identityTable-scoped keyed resource).
// Boot-critical so the default category-grouped tasks view never flashes "None"
// on first paint: boot-snapshot hydrates the value before the first render, and
// the eager web tier is derived from this flag (this module sits in the eager
// web import graph via the plugin's web barrel).
export const taskCategoriesResource = queryResourceDescriptor<TaskCategoryRow>(
  "task-categories",
  TaskCategoryRowSchema,
  "parentId",
  { bootCritical: true },
);
