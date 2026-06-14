import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import { SlowOpReportPayloadSchema } from "../../core";

// Bell re-alert cooldown for the slow-op rollup: re-alert at most once per
// minute while slowness persists. All slow ops within a window collapse onto
// that window's single notification row, so a burst surfaces one alert.
const SLOW_OP_NOTIF_COOLDOWN_MS = 60_000;

// The slow-op report kind. Unlike crash (one task per distinct fingerprint),
// slow ops dedup onto a SINGLE rollup task via a fixed fingerprint — slow ops
// are metrics that hide structural issues, so they want one ranked overview,
// not scattered sibling tasks. The live ranked data lives in the slow_ops store
// / Debug → Slow Ops; this task is just a pointer + the latest tripping op.
export const slowOpKind = ReportKind({
  kind: "slow-op",
  schema: SlowOpReportPayloadSchema,
  fingerprint: () => "slow-op:rollup",
  meta: {
    tag: "[slow-op]",
    notif: "Slow operations detected",
    variant: "warning",
    // Slow ops are a recurring metric on a singleton fingerprint, not a one-shot
    // incident: re-alert the bell at most once per window while slowness
    // persists. All slow ops within a window collapse onto that window's single
    // notification row, so a cold-start burst surfaces one alert, not a storm.
    notifCooldownMs: SLOW_OP_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => ({
    title: "[slow-op] Slow operations detected",
    description: renderDescription(row),
  }),
});

function renderDescription(row: ReportRow): string {
  const lines: string[] = [];
  lines.push(
    "One or more operations have been exceeding their configured slow-op threshold.",
  );
  lines.push("");
  lines.push(
    "See the live ranked breakdown (by total time, with caller attribution) in **Debug → Slow Ops**.",
  );
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  if (row.message) lines.push(`**Latest:** ${row.message}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
