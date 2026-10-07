import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { depsUpdatesConfig } from "../shared/config";
import {
  DEPS_CATEGORY_ID,
  depsUpgradesAutomation,
} from "./internal/detect-job";

export {
  DEPS_CATEGORY_ID,
  UpdaterDeclare,
  declaredUpdaters,
} from "./internal/detect-job";

export default {
  description:
    "The updater registry (UpdaterDeclare) and the Dependency upgrades automation (deps-upgrades; its job automation.deps-upgrades runs on a config cron, weekly by default): when any included updater has something newer than its lock records and no upgrade task is open, files ONE auto-started task (Dependencies category) covering every outdated updater, whose agent runs `./singularity deps upgrade` (all updaters behind one baseline and one candidate run) and, with Push when checks pass on, pushes on an `upgraded` verdict.",
  contributions: [
    ConfigV2.Register({ descriptor: depsUpdatesConfig }),
    TaskCategory({ id: DEPS_CATEGORY_ID, label: "Dependencies", order: 6 }),
  ],
  register: [depsUpgradesAutomation],
} satisfies ServerPluginDefinition;
