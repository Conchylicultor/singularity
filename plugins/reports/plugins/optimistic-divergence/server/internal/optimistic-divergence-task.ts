import type { ReportRow } from "@plugins/reports/server";
import { StoredOptimisticDivergencePayloadSchema } from "../../core";
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
  // The stored twin heals pre-`kind` legacy rows (a count bump re-renders them).
  return StoredOptimisticDivergencePayloadSchema.parse(row.data);
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

function headline(data: OptimisticDivergencePayload): string {
  return data.kind === "superseded"
    ? "optimistic op superseded by newer server truth"
    : "optimistic op stalled unconfirmed";
}

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const ops = data.opSummaries.join(", ");
  const raw = `${noisePrefix}[optimistic-divergence] ${headline(data)} — ${target(data)}${ops ? ` (${ops})` : ""}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  if (data.kind === "superseded") {
    lines.push(
      `An optimistic op was **dropped as superseded** — the healthy newer-truth outcome, reported for observability. \`useOptimisticResource\` predicted this op locally, POSTed it, the server acked it with a commit token — and then an authoritative snapshot for \`${data.resourceKey}\` whose watermark was *causally past that commit* (strict xid8 comparison, Rule B) still did not reflect the op's effect. That proves a newer server write overwrote it, so the primitive removed the op from the overlay: the UI is **rendering newer server truth, not reverting** the user's edit.`,
    );
    lines.push("");
    lines.push(`**What it means**`);
    lines.push(
      `Usually a lost concurrent-write race: another writer (a second tab, an agent, a background job) committed a conflicting change after this op, and the server kept that newer write. Occasional reports on a multi-writer surface are expected. A *recurring* report here means one surface is systematically losing its writes — check whether the endpoint should merge instead of overwrite, or whether two writers are fighting over the same rows.`,
    );
  } else {
    lines.push(
      `An optimistic op is **stalled unconfirmed** — server-acked, still rendered, never dropped. \`useOptimisticResource\` predicted this op locally, POSTed it, the server acked it (2xx) — but ${data.misses} consecutive authoritative live-state pushes for \`${data.resourceKey}\` arrived without ever confirming it, and none carried causal proof of supersession. Under the never-revert policy the op **stays in the overlay and keeps replaying** (the user's edit is safe on screen); this one-shot report is the investigation signal that confirmation is not converging.`,
    );
    lines.push("");
    lines.push(`**What it means**`);
    lines.push(
      `Either the consumer's \`apply\` / \`isConfirmedBy\` pair is wrong — \`apply\` predicts something \`isConfirmedBy\` can never recognize in server data, so a correct write looks unconfirmed forever — or the resource's pushes are lagging (the misses were stale snapshots computed before the commit). The first is a real correctness bug in that consumer; the second converges by itself once a fresh snapshot lands, but sustained lag is worth a look at the resource's push path.`,
    );
  }
  lines.push("");
  lines.push(`**Divergence**`);
  lines.push(`- **Kind:** \`${data.kind}\``);
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
      `- **${data.kind === "superseded" ? "Dropped" : "Stalled"} ops:** ${data.opSummaries.map((s) => `\`${s}\``).join(", ")}`,
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
  if (data.kind === "superseded") {
    lines.push(
      `If this row's count keeps growing, find the \`useOptimisticResource\` call for \`${data.resourceKey}\`${data.label ? ` with \`label: "${data.label}"\`` : ""} and identify the competing writer: query the resource's tables for who else writes the rows the ops above touch. Decide whether the endpoint should merge concurrent writes instead of last-write-wins, or whether the second writer shouldn't be writing at all. A rare, isolated report on a multi-writer surface needs no action.`,
    );
  } else {
    lines.push(
      `Find the \`useOptimisticResource\` call for \`${data.resourceKey}\`${data.label ? ` with \`label: "${data.label}"\`` : ""} and check its \`isConfirmedBy(serverData, vars)\` against what the server actually persists for the stalled ops above: it must return \`true\` once the committed row is visible in \`serverData\`. Compare the field it inspects with the endpoint handler's write — a normalized/derived value (trimmed text, re-ranked order, server-assigned id) will never equal the raw \`vars\` the prediction carried. If \`isConfirmedBy\` is right, re-read \`apply\`: predicting a state the server never produces is the same bug seen from the other side. If both are right, inspect the resource's push path for sustained lag — the op confirms by itself once a fresh snapshot lands — and consider having the mutation endpoint return its commit watermark (Rule A), which upgrades the op to an exact causal verdict instead of content matching.`,
    );
  }
  return lines.join("\n");
}
