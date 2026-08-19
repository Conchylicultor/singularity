import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { QueueClassStarvedPayloadSchema } from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// One-line class-starvation summary for the Debug → Reports list, e.g.
// "[starved] instant · nothing drained for 3m 00s · 12 ready, oldest 4m 10s"
// followed by the jobs stuck in that class as mono chips. The leading
// destructive chip separates it at a glance from the routine `queue-backlog` /
// `queue-slot-hog` rows: those say the queue is deep or slow, this one says one
// whole tier of it has stopped.
export function ClassStarvedSummary({ report }: { report: Report }) {
  const parsed = QueueClassStarvedPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="destructive">starved</Badge>
      <Badge mono>{d.hold}</Badge>
      <span>
        nothing drained for {formatDurationMs(d.starvedForMs)} · {d.readyCount}{" "}
        ready, oldest {formatDurationMs(d.oldestOverdueMs)} · {d.reachableSlots}{" "}
        slots
      </span>
      {(d.topReady ?? []).map((j) => (
        <Badge key={j.jobName} mono>
          {j.jobName}
        </Badge>
      ))}
    </Inline>
  );
}
