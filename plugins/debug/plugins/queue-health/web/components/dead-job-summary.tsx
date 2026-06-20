import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { QueueDeadJobPayloadSchema } from "../../core";

// One-line dead-job summary for the Debug → Reports list, e.g.
// "`improve.apply-queue-top` ×589 — Error: unknown job …". The job name renders
// as a mono chip; the latest error trails (truncated by the list row chrome).
export function DeadJobSummary({ report }: { report: Report }) {
  const parsed = QueueDeadJobPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="destructive" size="sm" mono>
        {d.jobName}
      </Badge>
      <span>×{d.deadCount}</span>
      {d.lastError ? <span>— {firstLine(d.lastError)}</span> : null}
    </Inline>
  );
}

function firstLine(s: string): string {
  return s.split("\n", 1)[0] ?? s;
}
