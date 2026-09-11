import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { DbQueryDeadlinePayloadSchema } from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// One-line summary for the Debug → Reports list, e.g.
// "[select count(*) from conversations_v] no answer for 60s — abandoned
//  · in a transaction". The query label is a mono chip (it truncates, the
// sentence does not), the wait trails, and a leased connection is called out
// because it means a transaction was cut short, not just one read.
export function QueryDeadlineSummary({ report }: { report: Report }) {
  const parsed = DbQueryDeadlinePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="destructive" mono title={d.sql}>
        {d.sql}
      </Badge>
      <span>no answer for {formatDurationMs(d.elapsedMs)} — abandoned</span>
      {d.leased ? (
        <span className="text-muted-foreground">· in a transaction</span>
      ) : null}
    </Inline>
  );
}
