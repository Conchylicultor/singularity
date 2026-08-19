import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { QueueWedgedPayloadSchema } from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// One-line wedge summary for the Debug → Reports list, e.g.
// "[wedged] 8/8 slots held ≥14m 03s · 690 ready" followed by the jobs sitting
// on the slots as mono chips. The leading destructive chip is what separates
// this at a glance from the routine `queue-backlog` / `queue-slot-hog` rows:
// those say the queue is deep or slow, this one says it has stopped.
export function WedgedSummary({ report }: { report: Report }) {
  const parsed = QueueWedgedPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  const counts = new Map<string, number>();
  for (const h of d.holders)
    counts.set(h.jobName, (counts.get(h.jobName) ?? 0) + 1);

  return (
    <Inline gap="xs">
      <Badge variant="destructive">wedged</Badge>
      <span>
        {d.holders.length}/{d.concurrency} slots held ≥
        {formatDurationMs(d.heldForMs)} · {d.readyCount} ready
      </span>
      {[...counts.entries()].map(([jobName, n]) => (
        <Badge key={jobName} mono>
          {n > 1 ? `${jobName} ×${n}` : jobName}
        </Badge>
      ))}
    </Inline>
  );
}
