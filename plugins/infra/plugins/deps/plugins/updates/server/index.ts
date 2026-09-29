import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { DEPS_CATEGORY_ID, detectOutdatedDepsJob } from "./internal/detect-job";

export {
  DEPS_CATEGORY_ID,
  UpdaterDeclare,
  declaredUpdaters,
} from "./internal/detect-job";

export default {
  description:
    "The updater registry (UpdaterDeclare) and the daily deps.detect-outdated job: for each updater with something newer than its lock records and no open task, files one auto-started task (Dependencies category) whose agent runs `./singularity deps upgrade <updater>` and pushes on an `upgraded` verdict.",
  contributions: [
    TaskCategory({ id: DEPS_CATEGORY_ID, label: "Dependencies", order: 6 }),
  ],
  register: [detectOutdatedDepsJob],
} satisfies ServerPluginDefinition;
