import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { AdaptiveBarPayloadSchema } from "@plugins/reports/plugins/adaptive-bar/core";

// One-line Debug → Reports summary for the adaptive-bar kind: which assumption
// broke, which bar broke it (its accessible label — the only name a generic
// primitive has), and the primitive's own sentence about it. No trace — a layout
// fault is a disagreement between the fit math and the browser's layout engine,
// not a server flight window.
export function AdaptiveBarKindView({ report }: { report: Report }) {
  const parsed = AdaptiveBarPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.fault}
      </Badge>
      <span className="truncate" title={d.label}>
        {d.label}
      </span>
      <span className="text-muted-foreground truncate">{d.message}</span>
    </Inline>
  );
}
