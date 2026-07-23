import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listTaskCategories } from "@plugins/tasks/plugins/task-category/core";
import { TaskCategory } from "./contribution";

// The set is static after boot (each filing plugin contributes its category at
// load time). Sorted by `order ?? 0` then id so section order is deterministic.
export const handleListTaskCategories = implement(listTaskCategories, async () => ({
  categories: [...TaskCategory.getContributions()]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
    .map(({ id, label, order }) => ({ id, label, order })),
}));
