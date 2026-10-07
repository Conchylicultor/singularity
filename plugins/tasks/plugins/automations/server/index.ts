import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { taskStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { automationTaskStatusJob } from "./internal/attention";
import { watchAutomationConfigs } from "./internal/watch";
import {
  automationsCatalogServed,
  automationTasksServed,
} from "./internal/live";

// What an automation's plugin uses: `defineAutomation` declares one (mount it
// in `register`). Readers use the core live values; nothing names an
// automation.
export { defineAutomation } from "./internal/define";
export { automationConfigRegistration } from "./internal/config-registration";
export type { Automation } from "./internal/define";
export type { AutomationDetectCtx, AutomationSpec } from "./internal/registry";
export type { AutomationFiling } from "./internal/origin";

export default {
  description:
    "Automations registry: defineAutomation declares something that files a task and launches its agent on its own, and owns its job (automation.<id>) — its config document (defineAutomationConfig: enabled, push policy, model, excluded sources, trigger — a schedule re-installed live on change, or an event whose bursts settle into one run — and the prompt template), the one-open-task dedupe, the filled prompt, the filing (task + category + tasks_ext_origin row in one transaction) and the armed launch. Serves the automations.catalog value and the automations.tasks collection (the origin side-table), and notifies the bell when an automated task needs its person.",
  contributions: [
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
  onAllReady: () => {
    watchAutomationConfigs();
  },
} satisfies ServerPluginDefinition;
