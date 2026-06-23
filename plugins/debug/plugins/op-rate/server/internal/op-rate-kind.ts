import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import { OpRatePayloadSchema, type OpRatePayload } from "../../core";

// Re-alert the bell at most once per 10 minutes while an op stays hot. A
// call-rate spike is a persistent condition (the op keeps getting hammered tick
// after tick), not a one-shot incident, so the cooldown re-surfaces it
// periodically without spamming — same rationale as slow-op's cooldown.
const OP_RATE_NOTIF_COOLDOWN_MS = 600_000;

// The `op-rate` report kind. Dedups per distinct `${kind}:${label}`, so each hot
// op gets its own task pointing directly at the cause (the over-called op),
// while distinct hot ops get distinct tasks. Variant `warning`: a call-rate
// spike is a degradation signal (it points at the cause of load), not a hard
// failure.
export const opRateKind = ReportKind({
  kind: "op-rate",
  schema: OpRatePayloadSchema,
  fingerprint: (d: OpRatePayload) => `op-rate:${d.kind}:${d.label}`,
  meta: {
    tag: "[op-rate]",
    notif: "Endpoint call-rate spike",
    variant: "warning",
    notifCooldownMs: OP_RATE_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = OpRatePayloadSchema.parse(row.data);
    return {
      title: `[op-rate] ${d.kind} ${d.label} — ${d.callsInWindow} calls/window`,
      description: renderDescription(row, d),
    };
  },
});

function renderDescription(row: ReportRow, d: OpRatePayload): string {
  const lines: string[] = [];
  lines.push(
    `The \`${d.kind}\` op \`${d.label}\` was called **${d.callsInWindow}** ` +
      `times within a single monitor window — past the per-kind threshold of ` +
      `${d.threshold}. A hammered op points straight at the cause of load ` +
      "(not just the collateral slow spans it produces); investigate who is " +
      "issuing this many calls.",
  );
  lines.push("");
  lines.push(`**Op:** \`${d.kind}\` \`${d.label}\``);
  lines.push(`**Calls in window:** ${d.callsInWindow}`);
  lines.push(`**Threshold:** ${d.threshold}`);
  lines.push(`**Window:** ${Math.round(d.windowMs / 1000)}s`);
  lines.push("");
  lines.push(
    "Inspect the live call counts in the **Debug → Reports** / runtime " +
      "profiler surfaces (the per-op `count` aggregates this monitor diffs).",
  );
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
