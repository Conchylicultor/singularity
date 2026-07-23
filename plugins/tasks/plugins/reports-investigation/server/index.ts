import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { REPORTS_CATEGORY_ID, registerReportsInvestigation } from "./internal/register";

export default {
  description:
    "Files reports' on-demand investigation tasks: owns the Reports task category and registers the task-creating handler into reports' investigation sink.",
  contributions: [TaskCategory({ id: REPORTS_CATEGORY_ID, label: "Reports", order: 4 })],
  onReady: registerReportsInvestigation,
} satisfies ServerPluginDefinition;
