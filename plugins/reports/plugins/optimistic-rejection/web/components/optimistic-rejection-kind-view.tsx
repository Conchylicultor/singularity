import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { OptimisticRejectionPayloadSchema } from "@plugins/reports/plugins/optimistic-rejection/core";

// One-line Debug → Reports summary for the optimistic-rejection kind: the HTTP
// status, the resource + label, the rejected op, and the server's reason.
export function OptimisticRejectionKindView({ report }: { report: Report }) {
  const parsed = OptimisticRejectionPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const what = d.label ? `${d.resourceKey}/${d.label}` : d.resourceKey;

  return (
    <Inline gap="xs">
      <Badge variant="destructive" mono>
        {d.status}
      </Badge>
      <span className="truncate font-mono" title={what}>
        {what}
      </span>
      {d.opSummary && (
        <span className="text-muted-foreground truncate">{d.opSummary}</span>
      )}
      <span className="text-muted-foreground truncate" title={d.message}>
        {d.message}
      </span>
    </Inline>
  );
}
