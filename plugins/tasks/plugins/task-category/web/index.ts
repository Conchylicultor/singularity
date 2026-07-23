import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { CategoryField } from "./components/category-field";

export { useTaskCategories, useTaskCategoryMap } from "./hooks";
export { taskCategoriesResource, TaskCategoryRowSchema } from "../shared/resources";
export type { TaskCategoryRow } from "../shared/resources";

export default {
  description:
    "Per-task category (registry-driven, system-set only): contributes the `category` enum field into the tasks DataView so the task list can group by it.",
  contributions: [Tasks.Fields({ id: "category", component: CategoryField })],
} satisfies PluginDefinition;
