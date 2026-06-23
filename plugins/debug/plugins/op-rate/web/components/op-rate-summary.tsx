import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { OpRatePayloadSchema } from "../../core";

// One-line call-rate summary for the Debug → Reports list, e.g.
// "`db select-tasks` ×6204 — threshold 5000". The op (`kind:label`) renders as a
// mono chip; the per-window call count and threshold trail.
export function OpRateSummary({ report }: { report: Report }) {
  const parsed = OpRatePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.kind}:{d.label}
      </Badge>
      <span>×{d.callsInWindow}</span>
      <span>— threshold {d.threshold}</span>
    </Inline>
  );
}
