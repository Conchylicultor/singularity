import type { ReportRow } from "@plugins/reports/server";
import { OptimisticDivergencePayloadSchema } from "../../core";
import type { OptimisticDivergencePayload } from "../../core";

// Notification re-arm window: a still-present divergence is a correctness
// warning that keeps happening on every edit of the affected surface, not a
// one-shot crash — so it resurfaces occasionally (every 6h) rather than
// once-forever. Same policy as render-loop. Lives here (not the barrel) per
// barrel-purity.
export const OPTIMISTIC_DIVERGENCE_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): OptimisticDivergencePayload {
  // The row's data was validated by OptimisticDivergencePayloadSchema at ingest,
  // so this is a total parse; failure would be a corrupted row (surfaced loudly).
  return OptimisticDivergencePayloadSchema.parse(row.data);
}

export function renderOptimisticDivergenceTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

function target(data: OptimisticDivergencePayload): string {
  return data.label ? `${data.resourceKey}/${data.label}` : data.resourceKey;
}

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const ops = data.opSummaries.join(", ");
  const raw = `${noisePrefix}[optimistic-divergence] optimistic op never confirmed by server — ${target(data)}${ops ? ` (${ops})` : ""}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(
    `An optimistic mutation's **predicted effect and the server's committed effect disagree**. \`useOptimisticResource\` predicted this op locally, POSTed it, the server acked it — but ${data.misses} consecutive authoritative live-state pushes for \`${data.resourceKey}\` arrived without ever reflecting the prediction. The primitive dropped the op, so the UI has converged on server truth (**nothing is stuck or lost**), and filed this report.`,
  );
  lines.push("");
  lines.push(`**What it means**`);
  lines.push(
    `Either the consumer's \`apply\` / \`isConfirmedBy\` pair is wrong — \`apply\` predicts something \`isConfirmedBy\` can never recognize in server data, so a correct write looks unconfirmed forever — or the write genuinely lost a concurrent-write conflict and the server durably committed something else. The first is a real correctness bug in that consumer; the second should be rare and visible in the DB.`,
  );
  lines.push("");
  lines.push(`**Divergence**`);
  lines.push(`- **Resource:** \`${data.resourceKey}\``);
  if (data.label) lines.push(`- **Label:** \`${data.label}\``);
  if (data.params && Object.keys(data.params).length > 0) {
    const params = Object.entries(data.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`- **Params:** \`${params}\``);
  }
  if (data.opSummaries.length > 0) {
    lines.push(
      `- **Dropped ops:** ${data.opSummaries.map((s) => `\`${s}\``).join(", ")}`,
    );
  }
  lines.push(
    `- **Misses:** ${data.misses} authoritative pushes since the server acked, none confirming`,
  );
  lines.push("");
  lines.push(`**Report**`);
  lines.push(`- **Source:** ${row.source}`);
  lines.push(`- **Worktree:** ${row.worktree}`);
  lines.push(`- **Fingerprint:** ${row.fingerprint}`);
  lines.push(`- **Count:** ${row.count}`);
  lines.push(`- **First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`- **Last seen:** ${row.lastSeenAt.toISOString()}`);
  if (row.url) lines.push(`- **URL:** ${row.url}`);
  if (row.userAgent) lines.push(`- **User-Agent:** ${row.userAgent}`);
  lines.push("");
  lines.push(`**How to fix**`);
  lines.push(
    `Find the \`useOptimisticResource\` call for \`${data.resourceKey}\`${data.label ? ` with \`label: "${data.label}"\`` : ""} and check its \`isConfirmedBy(serverData, vars)\` against what the server actually persists for the dropped ops above: it must return \`true\` once the committed row is visible in \`serverData\`. Compare the field it inspects with the endpoint handler's write — a normalized/derived value (trimmed text, re-ranked order, server-assigned id) will never equal the raw \`vars\` the prediction carried. If \`isConfirmedBy\` is right, re-read \`apply\`: predicting a state the server never produces is the same bug seen from the other side. If both are right, the write is losing a concurrent-write race and the endpoint needs conflict resolution.`,
  );
  return lines.join("\n");
}
