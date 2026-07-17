import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { DuressEpisodeReportPayloadSchema } from "../../core";

// One-line duress-episode summary for the Debug → Reports list, e.g.
// "duress: decompressionsPerSec, loadRatio — 42s (forced)". The cause-signature
// renders as a warning-colored mono chip; the duration + forced flag trail.
export function DuressEpisodeSummary({ report }: { report: Report }) {
  const parsed = DuressEpisodeReportPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const cause = d.elevated.length > 0 ? d.elevated.join(", ") : "adopted";

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {cause}
      </Badge>
      <span>— {Math.round(d.durationMs / 1000)}s</span>
      {d.forced && <span className="text-muted-foreground">(forced)</span>}
    </Inline>
  );
}
