import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { outcomeReportShape } from "../../core";

export const taskOutcomeReports = defineExtension(
  _tasks,
  "outcome_report",
  outcomeReportShape,
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _taskOutcomeReportsExt = taskOutcomeReports.table;
