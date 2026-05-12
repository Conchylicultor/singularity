import type { ServerPluginDefinition } from "@server/types";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationCreated } from "@plugins/conversations/server";
import { ensureImprovementsMetaTask } from "./internal/meta-improvements";
import { applyGroupJob } from "./internal/apply-group-job";

export { _improve_config, _improvePendingGroups } from "./internal/tables";
export { IMPROVEMENTS_META_TASK_ID } from "../internal/constants";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button and meta-task for app-improvement feedback. Files tasks under "Improvements" via the shared task-draft-form primitive.',
  register: [applyGroupJob],
  contributions: [
    Trigger({ on: conversationCreated, do: applyGroupJob, with: {}, oneShot: false }),
  ],
  onReady: async () => {
    await ensureImprovementsMetaTask();
  },
} satisfies ServerPluginDefinition;
