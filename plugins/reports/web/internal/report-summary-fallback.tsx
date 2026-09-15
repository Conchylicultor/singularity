import type { Report } from "../../core";

// Summary for a report whose kind has no registered Reports.KindView — render
// the generic one-line message. (Should be rare; a kind normally ships a view.)
export function ReportSummaryFallback({ report }: { report: Report }) {
  return <>{report.message}</>;
}
