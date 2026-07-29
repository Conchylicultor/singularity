import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import {
  blockPromptTasksServerResource,
  promptTaskOriginsServerResource,
} from "./internal/resource";
import { handleCreatePromptBlockTask } from "./internal/routes";
import { PAGES_CATEGORY_ID } from "./internal/mutations";
import { createPromptBlockTask } from "../shared/endpoints";

export { promptBlock } from "./internal/tables";
export {
  PAGES_CATEGORY_ID,
  createTaskFromPromptBlock,
  getPromptTaskOrigin,
} from "./internal/mutations";
export {
  blockPromptTasksServerResource,
  promptTaskOriginsServerResource,
} from "./internal/resource";

export default {
  description:
    "Owns the tasks_ext_prompt_block side-table: the page/block a task was launched from, the block-keyed and task-keyed live reads over it, the create-task endpoint, and the Pages task category.",
  contributions: [
    Resource.Declare(blockPromptTasksServerResource),
    Resource.Declare(promptTaskOriginsServerResource),
    TaskCategory({ id: PAGES_CATEGORY_ID, label: "Pages", order: 5 }),
  ],
  httpRoutes: {
    [createPromptBlockTask.route]: handleCreatePromptBlockTask,
  },
} satisfies ServerPluginDefinition;
