import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { listTaskCategories } from "@plugins/tasks/plugins/task-category/core";
import { taskCategoriesServed } from "./internal/resource";
import { handleListTaskCategories } from "./internal/handle-list-categories";

export { TaskCategory } from "./internal/contribution";
export { tasksCategory } from "./internal/tables";
export { getTaskCategory, setTaskCategory } from "./internal/mutations";

export default {
  description:
    "Owns the tasks_ext_category side-table: the per-task category (registry-driven via the TaskCategory contribution, system-set only), its live collection (the whole ordered set, routed and L2-persisted), and the category-list endpoint.",
  contributions: [...taskCategoriesServed.declare],
  httpRoutes: {
    [listTaskCategories.route]: handleListTaskCategories,
  },
} satisfies ServerPluginDefinition;
