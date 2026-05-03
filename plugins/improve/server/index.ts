import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  conversationTurnCompleted,
} from "@plugins/conversations/server";
import { ensureImprovementsMetaTask } from "./internal/meta-improvements";
import { applyGroupJob } from "./internal/apply-group-job";
import { applyQueueTopJob } from "./internal/apply-queue-top-job";
import { handleQueueTop } from "./internal/handle-queue-top";

export { _improve_config, _improvePendingGroups, _improvePendingQueueTop } from "./internal/tables";
export { IMPROVEMENTS_META_TASK_ID } from "../shared/constants";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button and meta-task for app-improvement feedback. Files tasks under "Improvements" via the shared task-draft-form primitive.',
  httpRoutes: {
    "POST /api/improve/queue-top": handleQueueTop,
  },
  register: [applyGroupJob, applyQueueTopJob],
  onReady: async () => {
    await ensureImprovementsMetaTask();
    await deleteTriggersFor(applyGroupJob);
    await trigger({
      on: conversationCreated,
      do: applyGroupJob,
      with: {},
      oneShot: false,
    });
    await deleteTriggersFor(applyQueueTopJob);
    await trigger({
      on: conversationTurnCompleted,
      do: applyQueueTopJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
