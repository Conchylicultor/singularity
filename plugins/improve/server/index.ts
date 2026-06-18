import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { ContainerTask } from "@plugins/tasks/plugins/container-tasks/server";
import { conversationCreated } from "@plugins/conversations/server";
import { IMPROVEMENTS_META_TASK_ID } from "../shared/constants";
import { ensureImprovementsMetaTask } from "./internal/meta-improvements";
import { applyGroupJob } from "./internal/apply-group-job";

export { _improve_config, _improvePendingGroups } from "./internal/tables";
export { IMPROVEMENTS_META_TASK_ID } from "../shared/constants";

export default {
  description:
    'Toolbar button and meta-task for app-improvement feedback. Files tasks under "Improvements" via the shared task-draft-form primitive.',
  register: [applyGroupJob],
  contributions: [
    Trigger({ on: conversationCreated, do: applyGroupJob, with: {}, oneShot: false }),
    ContainerTask({ id: IMPROVEMENTS_META_TASK_ID }),
  ],
  onReady: async () => {
    await ensureImprovementsMetaTask();
  },
} satisfies ServerPluginDefinition;
