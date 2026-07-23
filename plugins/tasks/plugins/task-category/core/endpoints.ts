import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// One registered task category, as contributed by a filing plugin.
export const TaskCategoryDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  order: z.number().optional(),
});
export type TaskCategoryDef = z.infer<typeof TaskCategoryDefSchema>;

// Lists every registered task category, ordered by `order ?? 0` then id. The
// set is static after boot (each filing plugin contributes its category), so
// the web caches it indefinitely.
export const listTaskCategories = defineEndpoint({
  route: "GET /api/tasks/categories",
  response: z.object({ categories: z.array(TaskCategoryDefSchema) }),
});
