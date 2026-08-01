import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { CaretFlightPayloadSchema } from "@plugins/reports/plugins/caret-flight/core";

// One-line Debug → Reports summary for the caret-flight kind: why the landing was
// given up on, how much input was being held, and — the bit that decides how bad
// it is — whether that input found a home or was lost.
export function CaretFlightKindView({ report }: { report: Report }) {
  const parsed = CaretFlightPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  const lost = d.replayedInto === null;

  return (
    <Inline gap="xs">
      <Badge variant={lost ? "destructive" : "warning"} mono>
        {d.reason}
      </Badge>
      <span className="tabular-nums">{d.buffered} keystrokes</span>
      <span className="text-muted-foreground">
        {lost ? "lost — nothing could take them" : "replayed into the origin block"}
      </span>
    </Inline>
  );
}
