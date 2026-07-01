import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { QueueSlotHogPayloadSchema } from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// One-line slot-hog summary for the Debug → Reports list, e.g.
// "`conversations.hibernate` held for 11m 03s". The job name renders as a mono
// chip; the locked duration trails.
export function SlotHogSummary({ report }: { report: Report }) {
  const parsed = QueueSlotHogPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.jobName}
      </Badge>
      <span>held for {formatDurationMs(d.lockedForMs)}</span>
    </Inline>
  );
}
