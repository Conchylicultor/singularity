import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { CONFIG_CATEGORY_ID } from "../shared/constants";

export default {
  description:
    'Registers the "Config" task category the config-conflict draft popover files into.',
  contributions: [
    TaskCategory({ id: CONFIG_CATEGORY_ID, label: "Config", order: 6 }),
  ],
} satisfies ServerPluginDefinition;
