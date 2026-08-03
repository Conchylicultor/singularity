import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { CollabHydrationPayloadSchema } from "@plugins/reports/plugins/collab-hydration/core";

// One-line Debug → Reports summary for the collab-hydration kind: which side was
// behind, and the three lengths whose disagreement is the defect (rendered / doc
// / row) — the same triple the investigation task reasons from.
export function CollabHydrationKindView({ report }: { report: Report }) {
  const parsed = CollabHydrationPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.reason}
      </Badge>
      <span className="tabular-nums">
        shown {d.shownLength} · doc {d.docLength} · row {d.rowLength}
      </span>
      <span className="text-muted-foreground">
        {d.reason === "blind-binding"
          ? "editor behind its doc — binding re-attached"
          : "doc behind the server — state re-read"}
      </span>
    </Inline>
  );
}
