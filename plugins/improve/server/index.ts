import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import { conversationCreated } from "@plugins/conversations/server";
import { ensureImprovementsMetaTask } from "./internal/meta-improvements";
import { handleSubmit } from "./internal/handle-submit";
import { applyGroupJob } from "./internal/apply-group-job";

export { _improve_config, _improvePendingGroups } from "./internal/tables";
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
    await deleteTriggersFor(applyGroupJob);
    await trigger({
      on: conversationCreated,
      do: applyGroupJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
