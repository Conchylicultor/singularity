import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { taskStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { automationsConfig } from "../shared/config";
import { automationTaskStatusJob } from "./internal/attention";
import {
  automationsCatalogServed,
  automationTasksServed,
} from "./internal/live";

// What an automation's plugin uses: `defineAutomation` declares one (mount it
// in `register`). Readers use the core live values; nothing names an
// automation.
export { defineAutomation } from "./internal/define";
export type { Automation } from "./internal/define";
export type { AutomationDetectCtx, AutomationSpec } from "./internal/registry";
export type { AutomationFiling } from "./internal/origin";

export default {
  description:
    "Automations registry: defineAutomation declares something that files a task and launches its agent on its own, and owns its job (automation.<id>) — settings resolution (automationsConfig over declared defaults: enabled, autoPush, model, excluded sources), the one-open-task dedupe, the filing (task + category + tasks_ext_origin row in one transaction) and the armed launch. Serves the automations.catalog value and the automations.tasks collection (the origin side-table), and notifies the bell when an automated task needs its person.",
  contributions: [
    ConfigV2.Register({ descriptor: automationsConfig }),
    ...automationsCatalogServed.declare,
    ...automationTasksServed.declare,
    Trigger({
      on: taskStatusChanged,
      do: automationTaskStatusJob,
      with: {},
      oneShot: false,
    }),
  ],
  register: [automationTaskStatusJob],
} satisfies ServerPluginDefinition;
