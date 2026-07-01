import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import {
  SlowOpReportPayloadSchema,
  type SlowOpReportPayload,
} from "../../core";

// Bell re-alert cooldown for a slow op: re-alert at most once per minute while
// that operation stays slow. Repeats of the same op within a window collapse
// onto that window's single notification row, so a burst surfaces one alert.
const SLOW_OP_NOTIF_COOLDOWN_MS = 60_000;

// The slow-op report kind. Dedups per distinct `${operationKind}:${operation}`,
// so each slow operation gets its own task pointing straight at the offending op
// — keeping its own count, caller history, and context — while distinct slow ops
// get distinct tasks (a slow loader for resource X is a different bug than a slow
// HTTP route Y). The live ranked breakdown across all ops still lives in the
// slow_ops store / Debug → Slow Ops; each task drills into one of them.
export const slowOpKind = ReportKind({
  kind: "slow-op",
  schema: SlowOpReportPayloadSchema,
  fingerprint: (d: SlowOpReportPayload) =>
    `slow-op:${d.operationKind}:${d.operation}`,
  meta: {
    tag: "[slow-op]",
    notif: "Slow operation detected",
    variant: "warning",
    // A slow op is a recurring metric, not a one-shot incident: re-alert the
    // bell at most once per window while it stays slow. Repeats of the same op
    // within a window collapse onto that window's single notification row, so a
    // burst surfaces one alert, not a storm.
    notifCooldownMs: SLOW_OP_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = SlowOpReportPayloadSchema.parse(row.data);
    const coldStartSuffix = d.transportColdStart ? " — transport cold-start" : "";
    return {
      title: `[slow-op] ${d.operationKind} ${d.operation} — ${Math.round(d.durationMs)}ms${coldStartSuffix}`,
      description: renderDescription(row, d),
    };
  },
});

function renderDescription(row: ReportRow, d: SlowOpReportPayload): string {
  const lines: string[] = [];
  lines.push(
    `The \`${d.operationKind}\` operation \`${d.operation}\` has been exceeding ` +
      `its configured slow-op threshold of ${d.thresholdMs}ms.`,
  );
  lines.push("");
  lines.push(`**Operation:** \`${d.operationKind}\` \`${d.operation}\``);
  lines.push(`**Latest duration:** ${Math.round(d.durationMs)}ms`);
  lines.push(`**Threshold:** ${d.thresholdMs}ms`);
  if (d.transportColdStart) {
    const waited =
      d.transportWaitMs !== undefined ? ` (waited ~${Math.round(d.transportWaitMs)}ms for the socket)` : "";
    lines.push("");
    lines.push(
      `**Root cause:** the notifications transport was not ready when this ` +
        `resource mounted${waited}. This duration is time-to-first-data over the ` +
        `transport, not the resource's own compute cost — investigate ` +
        `transport/boot readiness, not this resource. (Cold-start slowness is ` +
        `still a real regression to fix at the source.)`,
    );
  }
  lines.push("");
  lines.push(
    "See this op's full ranked breakdown — total time, max, and caller " +
      "attribution — in **Debug → Slow Ops**.",
  );
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
