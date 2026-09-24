import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getAttemptSourceUrl } from "../core";
import { handleGetAttemptSourceUrl } from "./internal/mutations";

export { tasksSourceUrl } from "./internal/tables";
export { setTaskSourceUrl } from "./internal/mutations";

export default {
  description:
    "Owns the tasks_ext_source_url side-table: the page a task was filed from (the draft form's Attach page URL), stored as data rather than only as prompt text, and read back by attempt.",
  httpRoutes: {
    [getAttemptSourceUrl.route]: handleGetAttemptSourceUrl,
  },
} satisfies ServerPluginDefinition;
