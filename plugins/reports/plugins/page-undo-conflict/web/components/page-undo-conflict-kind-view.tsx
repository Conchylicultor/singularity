import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { PageUndoConflictPayloadSchema } from "@plugins/reports/plugins/page-undo-conflict/core";

// One-line Debug → Reports summary for the page-undo-conflict kind: which
// conflict, which way the replay was running, and the expected / actual lengths
// whose disagreement is the conflict — the same pair the investigation task
// reasons from.
export function PageUndoConflictKindView({ report }: { report: Report }) {
  const parsed = PageUndoConflictPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.reason}
      </Badge>
      {d.direction && <Badge mono>{d.direction}</Badge>}
      <span className="tabular-nums">
        expected {d.expectedLength} · actual {d.actualLength}
      </span>
      <span className="text-muted-foreground">
        {d.reason === "stale-entry"
          ? "entry applied over a second writer"
          : "typing run dropped — remote change mid-run"}
      </span>
    </Inline>
  );
}
