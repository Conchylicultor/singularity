import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { OptimisticDivergencePayloadSchema } from "@plugins/reports/plugins/optimistic-divergence/core";

// One-line Debug → Reports summary for the optimistic-divergence kind: the
// resource + label that diverged, the ops that were dropped, and the miss count
// at which the primitive gave up predicting. No trace — divergence is a client
// prediction/server-truth disagreement, not a server flight window.
export function OptimisticDivergenceKindView({ report }: { report: Report }) {
  const parsed = OptimisticDivergencePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const what = d.label ? `${d.resourceKey}/${d.label}` : d.resourceKey;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        diverged
      </Badge>
      <span className="truncate font-mono" title={what}>
        {what}
      </span>
      {d.opSummaries.length > 0 && (
        <span className="text-muted-foreground truncate">
          {d.opSummaries.join(", ")}
        </span>
      )}
      <span className="text-muted-foreground tabular-nums">
        after {d.misses} pushes
      </span>
    </Inline>
  );
}
