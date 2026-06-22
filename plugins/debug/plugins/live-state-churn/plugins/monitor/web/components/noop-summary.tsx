import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { LiveStateNoopPayloadSchema } from "../../core";

// One-line no-op-churn summary for the Debug → Reports list, e.g.
// "`tasks` ~5.0/s · ×300/60s". The resource key renders as a warning-colored
// mono chip; the rate/count trails (truncated by the list row chrome).
export function NoopSummary({ report }: { report: Report }) {
  const parsed = LiveStateNoopPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.resourceKey}
      </Badge>
      <span>
        ~{d.noopRate.toFixed(1)}/s · ×{d.noopCount}/{d.windowSeconds}s
      </span>
    </Inline>
  );
}
