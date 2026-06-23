import { Resource, setErrorReporter } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleReport } from "./internal/handle-report";
import { handleInvestigate } from "./internal/handle-investigate";
import { reportsResource } from "./internal/resources";
import { recordReport } from "./internal/record-report";
import { ensureReportsMetaTask, REPORTS_META_TASK_ID } from "./internal/meta-reports";
import { ContainerTask } from "@plugins/tasks/plugins/container-tasks/server";
import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";
import { _reports } from "./internal/tables";
import { backfillNoiseClassification } from "./internal/backfill-noise";
import { flushBufferedReports, installProcessHooks } from "./internal/process-hooks";
import { submitReport, investigateReport } from "../shared/endpoints";

export { _reports } from "./internal/tables";
export { reportsResource } from "./internal/resources";
export { REPORTS_META_TASK_ID } from "./internal/meta-reports";
export { recordReport } from "./internal/record-report";
export { ReportNoiseRule } from "./internal/noise-rules";
export type { ReportNoiseRuleSpec, ReportNoiseInput } from "./internal/noise-rules";
export { ReportKind } from "./internal/report-kinds";
export type { ReportKindSpec, ReportKindVariant, ReportRow } from "./internal/report-kinds";

export default {
  description: "Records server/frontend crashes and files deduped tasks.",
  httpRoutes: {
    [submitReport.route]: handleReport,
    [investigateReport.route]: handleInvestigate,
  },
  contributions: [
    Resource.Declare(reportsResource),
    ContainerTask({ id: REPORTS_META_TASK_ID }),
    // Crash/report rows are deduped aggregates: a recurring fingerprint UPDATEs
    // its hot row (count++, last_seen_at) on every occurrence — a crash loop
    // fires this thousands/min. Wiring per-statement live-state invalidation onto
    // it made `reports` a top source of change-feed churn. The Reports pane
    // hydrates on open instead of live-ticking. See the change-feed exclusion doc.
    ExcludeFromChangeFeed({
      table: _reports,
      reason:
        "High-churn deduped crash/report counter; live-ticking it amplifies load during the exact crash storms it records. Pane hydrates on open.",
    }),
  ],
  onReady: async () => {
    installProcessHooks();
    setErrorReporter((report) => {
      void recordReport({
        kind: "crash",
        source: "server-caught",
        message: report.message,
        data: { errorType: report.errorType, stack: report.stack },
      });
    });
    await ensureReportsMetaTask();
    await flushBufferedReports();
    // Self-heal classifications snapshotted before the current noise rules
    // existed (e.g. pre-2026-06-07 ResizeObserver crashes left un-muted).
    await backfillNoiseClassification();
  },
} satisfies ServerPluginDefinition;
