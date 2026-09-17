import type { Report } from "@plugins/reports/core";
import { SentinelDownPayloadSchema } from "../../core";

// One-line sentinel-down summary for the Debug → Reports list, e.g.
// "Machine watcher down after 5 failed starts — Error: …".
export function SentinelDownSummary({ report }: { report: Report }) {
  const parsed = SentinelDownPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <span>
      Machine watcher down after {d.deaths} failed starts
      {d.lastError !== null && ` — ${d.lastError}`}
    </span>
  );
}
