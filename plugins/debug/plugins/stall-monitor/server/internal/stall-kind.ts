import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { traceDetailRoute } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { StallPayloadSchema, type StallPayload } from "../../core";

// Re-alert the bell at most once per 30 min while the same stack keeps freezing
// the loop. A recurring freeze is a persistent condition (the same code stalls
// tick after tick, e.g. the Jul-7 ccusage transcript-parse over days), not a
// one-shot incident, so the cooldown re-surfaces it periodically without spamming.
const STALL_NOTIF_COOLDOWN_MS = 30 * 60 * 1000;

// The `event-loop-stall` report kind — the alert-funnel side of a stall, the twin
// of the `stall` trace evidence. Dedups on the dominant CALLER STACK
// (`event-loop-stall:<culpritStack>`), not the leaf: the hottest leaf can be a
// generic native frame (`JSON.parse [native]`) shared by many callers, so a
// leaf-keyed fingerprint would misattribute (see server/internal/culprit.ts).
// Variant `error`: a frozen backend is the most severe slow event.
export const stallMonitorKind = ReportKind({
  kind: "event-loop-stall",
  schema: StallPayloadSchema,
  fingerprint: (d: StallPayload) => `event-loop-stall:${d.culpritStack}`,
  meta: {
    tag: "[stall]",
    notif: "Event-loop stall",
    variant: "error",
    notifCooldownMs: STALL_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = StallPayloadSchema.parse(row.data);
    return {
      title: `[stall] Event-loop stall: ${d.hotFrame} (${Math.round(d.durationMs)}ms)`,
      description: renderDescription(row, d),
    };
  },
});

function renderDescription(row: ReportRow, d: StallPayload): string {
  const lines: string[] = [];
  lines.push(
    `The main event loop was **frozen for ${Math.round(d.durationMs)}ms** ` +
      `(threshold ${Math.round(d.thresholdMs)}ms) — the whole backend blocked, ` +
      `serving nothing. The background-thread JSC sampling profiler kept sampling ` +
      `the blocked stack, so the code that froze the loop is named below.`,
  );
  lines.push("");
  lines.push(
    `**This report is the CAUSE.** Any slow-op reports (page loads, delivers, ` +
      `flushNotifies) filed in the same window are **victims** of this freeze — ` +
      `they were merely waiting on the blocked loop, not slow in themselves. Fix ` +
      `the stall below and the collateral reports stop.`,
  );
  lines.push("");
  lines.push(`**Freeze duration:** ${Math.round(d.durationMs)}ms`);
  lines.push(`**Threshold:** ${Math.round(d.thresholdMs)}ms`);
  lines.push(`**Samples:** ${d.nSamples} @ ~${d.sampleRateHz} Hz`);
  lines.push(`**Dominant caller stack:** \`${d.culpritStack}\``);

  if (d.topLeaves.length > 0) {
    lines.push("");
    lines.push("**Top hot frames:**");
    for (const l of d.topLeaves) {
      lines.push(`- \`${l.key}\` — ${l.count} (${l.pct}%)`);
    }
  }

  if (d.topStacks.length > 0) {
    lines.push("");
    lines.push("**Top stacks:**");
    for (const s of d.topStacks) {
      lines.push(`- \`${s.stack}\` — ${s.count} (${s.pct}%)`);
    }
  }

  if (d.traceId) {
    lines.push("");
    lines.push(
      `**Trace:** the coherent-instant stall trace (the full JSC histogram + what ` +
        `else was in flight at the freeze) is at ` +
        `\`${traceDetailRoute.link(debugApp, { id: d.traceId })}\` (Debug → Slow Events).`,
    );
  }

  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
