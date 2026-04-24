import type { ServerPluginDefinition } from "../../../server/src/types";
import { ensureImprovementsMetaTask } from "./internal/meta-improvements";
import { improveConfigResource } from "./internal/resources";
import { handleGetConfig, handlePatchConfig } from "./internal/handle-config";
import { handleSubmit } from "./internal/handle-submit";

export { _improve_config } from "./internal/tables";
export { IMPROVEMENTS_META_TASK_ID } from "./internal/meta-improvements";
export { improveConfigResource } from "./internal/resources";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button and meta-task for app-improvement feedback. Captures URL, optional screenshot, and files a task under "Improvements".',
  httpRoutes: {
    "POST /api/improve/submit": handleSubmit,
    "GET /api/improve/config": handleGetConfig,
    "PATCH /api/improve/config": handlePatchConfig,
  },
  resources: [improveConfigResource],
  onReady: async () => {
    await ensureImprovementsMetaTask();
  },
} satisfies ServerPluginDefinition;
