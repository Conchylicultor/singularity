import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import {
  QueueSlotHogPayloadSchema,
  type QueueSlotHogPayload,
} from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// Re-alert the bell at most once per 10 minutes while a job keeps hogging a
// slot. Slot-hogging is a persistent condition (the job stays locked tick after
// tick), so the cooldown re-surfaces it periodically without spamming — same
// rationale as the dead-job and backlog cooldowns.
const SLOT_HOG_NOTIF_COOLDOWN_MS = 600_000;

// The `queue-slot-hog` report kind. Dedups per distinct `jobName` (fingerprint
// `queue-slot-hog:<jobName>`), so one long-running job collapses onto a single
// report while distinct hogs get distinct reports. Variant `warning`: a job holding
// a shared worker slot for too long starves the queue — the exact case the
// backlog `stalled` signal (which only trips at 0 locked) cannot see.
export const slotHogKind = ReportKind({
  kind: "queue-slot-hog",
  schema: QueueSlotHogPayloadSchema,
  fingerprint: (d: QueueSlotHogPayload) => `queue-slot-hog:${d.jobName}`,
  meta: {
    tag: "[queue]",
    notif: "Job hogging a queue slot",
    variant: "warning",
    notifCooldownMs: SLOT_HOG_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = QueueSlotHogPayloadSchema.parse(row.data);
    return {
      title: `[queue] Slot hog: ${d.jobName}`,
      description: renderDescription(row, d),
    };
  },
});

function renderDescription(row: ReportRow, d: QueueSlotHogPayload): string {
  const lines: string[] = [];
  lines.push(
    `The job \`${d.jobName}\` has held a worker slot from the shared pool for ` +
      `${formatDurationMs(d.lockedForMs)}. While it holds the slot, other ready ` +
      "jobs wait behind it — the queue is saturated even though the worker is " +
      "running (so the backlog stall signal, which only trips at 0 locked, " +
      "stays silent).",
  );
  lines.push("");
  lines.push(`**Job:** \`${d.jobName}\``);
  lines.push(`**Held for:** ${formatDurationMs(d.lockedForMs)}`);
  lines.push(`**Running rows (this job):** ${d.runningCount}`);
  if (d.sampleJobId) lines.push(`**Sample job id:** ${d.sampleJobId}`);
  lines.push("");
  lines.push(
    "Inspect the live queue in **Debug → Queue** and the full report history " +
      "in **Debug → Reports**.",
  );
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
