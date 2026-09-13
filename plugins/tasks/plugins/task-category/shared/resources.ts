import type { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// One row per categorized task, stored in the `tasks_ext_category`
// entity-extension table (1:1 per task), which `server/internal/tables.ts`
// builds from this shape. `category` is the contributed registry id
// (system-set only — no user picker).
export const taskCategoryShape = defineExtensionShape({
  key: "taskId",
  fields: { category: textField() },
});
export const TaskCategoryRowSchema = taskCategoryShape.schema;
export type TaskCategoryRow = z.infer<typeof TaskCategoryRowSchema>;

// Keyed query-resource contract: rows key on `taskId` (the side-table PK). The
// server half is compiled from the extension handle in
// `server/internal/resource.ts` (default identityTable-scoped keyed resource).
// Boot-critical so the default category-grouped tasks view never flashes "None"
// on first paint: boot-snapshot hydrates the value before the first render, and
// the eager web tier is derived from this flag (this module sits in the eager
// web import graph via the plugin's web barrel).
export const taskCategoriesResource = queryResourceDescriptor<TaskCategoryRow>(
  "task-categories",
  TaskCategoryRowSchema,
  "taskId",
  { bootCritical: true },
);
