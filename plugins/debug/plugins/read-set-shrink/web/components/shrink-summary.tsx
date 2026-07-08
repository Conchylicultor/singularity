import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ReadSetShrinkPayloadSchema } from "../../core";

// One-line read-set-shrink summary for the Debug → Reports list, e.g.
// "`tasks` dropped notifications". The resource key renders as a warning-colored
// mono chip; the dropped-tables list trails (truncated by the list row chrome).
export function ShrinkSummary({ report }: { report: Report }) {
  const parsed = ReadSetShrinkPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.resourceKey}
      </Badge>
      <span>dropped {d.droppedTables.join(", ")}</span>
    </Inline>
  );
}
