import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

export interface InvestigationTaskRequest {
  existingTaskId: string | null;
  title: string;
  description: string;
  author: string;
}

// reports emits here on its investigate path; the tasks domain registers the
// task-creating handler. Absent handler (a composition without tasks) → emit
// returns undefined → investigateReport throws loudly (misconfiguration).
export const reportInvestigationSink = defineReportSink<
  InvestigationTaskRequest,
  Promise<{ taskId: string }>
>();
