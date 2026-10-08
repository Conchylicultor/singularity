import type { ReportRow } from "@plugins/reports/server";
import { OptimisticRejectionPayloadSchema } from "../../core";
import type { OptimisticRejectionPayload } from "../../core";

// Notification re-arm window: a rejection is a client/server disagreement that
// recurs on every edit of the same shape, not a one-shot crash — so it
// resurfaces occasionally (every 6h) rather than once-forever. Same policy as
// optimistic-divergence. Lives here (not the barrel) per barrel-purity.
export const OPTIMISTIC_REJECTION_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): OptimisticRejectionPayload {
  // Validated by OptimisticRejectionPayloadSchema at ingest, so this is a total
  // parse; failure would be a corrupted row (surfaced loudly).
  return OptimisticRejectionPayloadSchema.parse(row.data);
}

export function renderOptimisticRejectionTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

function target(data: OptimisticRejectionPayload): string {
  return data.label ? `${data.resourceKey}/${data.label}` : data.resourceKey;
}

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const op = data.opSummary ? ` (${data.opSummary})` : "";
  const raw = `${noisePrefix}[optimistic-rejection] HTTP ${data.status} — ${target(data)}${op}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(
    `The server **permanently rejected a write** to \`${data.resourceKey}\` with HTTP ${data.status}, and the user's edit was lost. Either \`useOptimisticResource\` predicted the op locally and POSTed it — the 4xx is a final verdict, so the primitive dropped the prediction (the surface now renders server truth) — or it was a detached \`enqueueDetachedWrite\` with nothing to predict. The user saw an error toast with the reason below.`,
  );
  lines.push("");
  lines.push(`**What it means**`);
  lines.push(
    `The client issued an op the server considers invalid: the client's prediction (which ops it emits, against which state) and the endpoint's validation disagree. One of the two is wrong — a client building an op the server will never accept, or an endpoint refusing a legitimate op. Every occurrence costs the user an edit.`,
  );
  lines.push("");
  lines.push(`**Rejection**`);
  lines.push(`- **Status:** ${data.status}`);
  lines.push(`- **Server reason:** ${data.message}`);
  lines.push(`- **Resource:** \`${data.resourceKey}\``);
  if (data.label) lines.push(`- **Label:** \`${data.label}\``);
  if (data.opSummary) lines.push(`- **Op:** \`${data.opSummary}\``);
  if (data.params && Object.keys(data.params).length > 0) {
    const params = Object.entries(data.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`- **Params:** \`${params}\``);
  }
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
    `Find the endpoint that writes \`${data.resourceKey}\`${data.opSummary ? ` for a \`${data.opSummary}\` op` : ""} and the handler branch that answers HTTP ${data.status} with the reason above. Then find the client code that dispatched the op (the \`useOptimisticResource\` call${data.label ? ` with \`label: "${data.label}"\`` : ""}, or the \`enqueueDetachedWrite\` naming this op) and reproduce the user gesture at the URL above. Decide which side is wrong: if the op is legitimate, the endpoint must accept it; if not, the client must not emit it (or must route it to an endpoint that can apply it). Add a test pinning the gesture on whichever side you fix.`,
  );
  return lines.join("\n");
}
