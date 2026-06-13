import { Resource, setErrorReporter } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleReport } from "./internal/handle-report";
import { reportsResource } from "./internal/resources";
import { recordReport } from "./internal/record-report";
import { ensureReportsMetaTask } from "./internal/meta-reports";
import { backfillNoiseClassification } from "./internal/backfill-noise";
import { flushBufferedReports, installProcessHooks } from "./internal/process-hooks";
import { submitReport } from "../shared/endpoints";

export { _reports } from "./internal/tables";
export { reportsResource } from "./internal/resources";
export { REPORTS_META_TASK_ID } from "./internal/meta-reports";
export { recordReport } from "./internal/record-report";
export { ReportNoiseRule } from "./internal/noise-rules";
export type { ReportNoiseRuleSpec, ReportNoiseInput } from "./internal/noise-rules";

export default {
  description: "Records server/frontend crashes and files deduped tasks.",
  httpRoutes: {
    [submitReport.route]: handleReport,
  },
  contributions: [Resource.Declare(reportsResource)],
  onReady: async () => {
    installProcessHooks();
    setErrorReporter((report) => {
      void recordReport({
        source: "server-caught",
        message: report.message,
        stack: report.stack,
        errorType: report.errorType,
      });
    });
    await ensureReportsMetaTask();
    await flushBufferedReports();
    // Self-heal classifications snapshotted before the current noise rules
    // existed (e.g. pre-2026-06-07 ResizeObserver crashes left un-muted).
    await backfillNoiseClassification();
  },
} satisfies ServerPluginDefinition;
