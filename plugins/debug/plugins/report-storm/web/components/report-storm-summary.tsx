import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ReportStormPayloadSchema } from "../../core";

// One-line storm summary for the Debug → Reports list, e.g.
// "`slow-op` — 418 fingerprints / 422 alerts in 24s (budget 20/window)". The
// collapsed kind renders as a warning-colored mono chip; the burst shape
// trails.
export function ReportStormSummary({ report }: { report: Report }) {
  const parsed = ReportStormPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const seconds = Math.max(
    1,
    Math.round((d.windowEndedAt - d.windowStartedAt) / 1000),
  );

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.collapsedKind}
      </Badge>
      <span>
        — {d.distinctFingerprints} fingerprints / {d.occurrences} alerts in{" "}
        {seconds}s
      </span>
      <span className="text-muted-foreground">
        (budget {d.budget}/window
        {d.rosterTruncated > 0 ? `, ${d.rosterTruncated} unnamed` : ""})
      </span>
    </Inline>
  );
}
