import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { QueueSlotBlockedPayloadSchema } from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// One-line slot-blocked summary for the Debug → Reports list, e.g.
// "`jobs.dead-gc` held a slot 1m 17s to do 0s of work, blocked on
// `background-tx-acquire`". Both the job and the gate render as mono chips —
// the gate is the actionable half, so it is never buried in prose.
export function SlotBlockedSummary({ report }: { report: Report }) {
  const parsed = QueueSlotBlockedPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.jobName}
      </Badge>
      <span>
        held a slot {formatDurationMs(d.holdMs)} to do{" "}
        {formatDurationMs(d.workMs)} of work, blocked on
      </span>
      <Badge mono>{d.layer}</Badge>
    </Inline>
  );
}
