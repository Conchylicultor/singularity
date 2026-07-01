import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ContainerTask } from "@plugins/tasks/plugins/container-tasks/server";
import { REPORTS_META_TASK_ID, registerReportsInvestigation } from "./internal/register";

export default {
  description:
    "Files reports' on-demand investigation tasks: owns the Reports meta-folder and registers the task-creating handler into reports' investigation sink.",
  contributions: [ContainerTask({ id: REPORTS_META_TASK_ID })],
  onReady: registerReportsInvestigation,
} satisfies ServerPluginDefinition;
