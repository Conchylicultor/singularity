import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { watchConfig } from "@plugins/config_v2/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { taskStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { automationConfigRegistration } from "@plugins/tasks/plugins/automations/server";
import { sidequestAutopilotConfig } from "../shared/config";
import { sidequestAutopilotAutomation } from "./internal/automation";
import { sidequestReadyJob } from "./internal/ready-job";
import { runUntilJob, scheduleRunUntil } from "./internal/run-until";

export default {
  description:
    "Declares the Sidequest autopilot automation (launch kind, off by default): while on, it starts agents on ready sidequests (no attempt, not held, dropped or blocked), oldest first, `concurrency` at a time (default 2), each with the autopilot prompt — never ask, check obsolescence first, stay in scope, push only what the push policy allows, finish with submit_outcome_report — and the next starts when one reports or settles. Woken when a task becomes ready; turns itself off at its `runUntil`.",
  contributions: [
    automationConfigRegistration(sidequestAutopilotConfig),
    Trigger({
      on: taskStatusChanged.where({ status: "new" }),
      do: sidequestReadyJob,
      with: {},
      oneShot: false,
    }),
  ],
  register: [sidequestAutopilotAutomation, sidequestReadyJob, runUntilJob],
  onAllReady: () => {
    scheduleRunUntil();
    watchConfig(sidequestAutopilotConfig, () => scheduleRunUntil());
  },
} satisfies ServerPluginDefinition;
