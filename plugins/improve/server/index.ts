import type { ServerPluginDefinition } from "@server/types";
import { ensureImprovementsMetaTask } from "./internal/meta-improvements";
import { handleSubmit } from "./internal/handle-submit";

export { _improve_config } from "./internal/tables";
export { IMPROVEMENTS_META_TASK_ID } from "./internal/meta-improvements";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button and meta-task for app-improvement feedback. Captures URL, optional screenshot, and files a task under "Improvements".',
  httpRoutes: {
    "POST /api/improve/submit": handleSubmit,
  },
  onReady: async () => {
    await ensureImprovementsMetaTask();
  },
} satisfies ServerPluginDefinition;
