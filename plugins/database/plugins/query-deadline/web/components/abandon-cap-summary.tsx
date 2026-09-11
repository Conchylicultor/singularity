import type { Report } from "@plugins/reports/core";
import { DbAbandonCapPayloadSchema } from "../../core";

// One-line summary for the Debug → Reports list, e.g.
// "33 abandoned database connections — over the cap of 32".
export function AbandonCapSummary({ report }: { report: Report }) {
  const parsed = DbAbandonCapPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <span>
      {d.abandoned} abandoned database connections — over the cap of {d.cap}
    </span>
  );
}
