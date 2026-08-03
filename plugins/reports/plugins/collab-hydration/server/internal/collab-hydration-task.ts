import type { ReportRow } from "@plugins/reports/server";
import { CollabHydrationPayloadSchema } from "../../core";
import type { CollabHydrationPayload } from "../../core";

// Notification re-arm window: the user SAW their text disappear (the editor
// recovers, but not before they noticed), so it resurfaces every 6h rather than
// once-forever — same policy as caret-flight / optimistic-divergence.
export const COLLAB_HYDRATION_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): CollabHydrationPayload {
  // Validated by CollabHydrationPayloadSchema at ingest, so this is a total
  // parse; failure would be a corrupted row (surfaced loudly).
  return CollabHydrationPayloadSchema.parse(row.data);
}

export function renderCollabHydrationTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const what =
    data.reason === "blind-binding"
      ? "editor rendered less than its content doc"
      : "content doc fell behind the server";
  const raw = `${noisePrefix}[collab-hydration] ${data.reason} — ${what}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(
    `A block's text stopped agreeing with itself. A block's text has exactly ONE owner — its per-block \`Y.Doc\` — and \`page_blocks.data.text\` is a ~1s projection of it; the Lexical editor is a VIEW hydrated exclusively through the update events \`@lexical/yjs\` fires AFTER its binding attaches. At detection: **rendered ${data.shownLength}**, **doc ${data.docLength}**, **row ${data.rowLength}** characters.`,
  );
  lines.push("");
  lines.push(`**What \`${data.reason}\` means**`);
  lines.push(reasonExplanation(data));
  lines.push("");
  lines.push(
    `**This was recovered automatically** — the editor re-read the authoritative state and re-attached its binding to a fresh replica, and the projection was suppressed so the emptiness was never written to the row. The user still saw their text vanish until the recovery landed, and the recovery is a safety net, not the fix.`,
  );
  lines.push("");
  lines.push(`**How to investigate**`);
  lines.push(
    `1. Read the invariants first: the "Per-block CRDT text" section of \`plugins/page/plugins/editor/CLAUDE.md\` and \`research/2026-07-23-page-collab-binding-replicas.md\` (why a binding must attach to an EMPTY doc).`,
  );
  lines.push(
    `2. The reproduction driver is \`bun plugins/page/plugins/editor/e2e/split-empty-repro-2clients.ts --cpu 4\` (two clients on one page; the observing client's freshly-split block is the one that goes empty).`,
  );
  lines.push(
    data.reason === "blind-binding"
      ? `3. Establish how this binding attached to a doc that already held content, or how it missed the events for content applied after it attached — \`BindingReplica\`'s construction invariant is supposed to make the first impossible.`
      : `3. Establish why the \`page-block-doc\` push never reached this client. Note the standing evidence that this resource loses pushes: \`reports\` carries "live-state wedged: missed-updates — page-block-doc" occurrences.`,
  );
  lines.push("");
  lines.push(`**Block**`);
  lines.push(`- **Block id:** \`${data.blockId}\``);
  lines.push(`- **Rendered / doc / row:** ${data.shownLength} / ${data.docLength} / ${data.rowLength}`);
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
  return lines.join("\n");
}

function reasonExplanation(data: CollabHydrationPayload): string {
  switch (data.reason) {
    case "blind-binding":
      return `The editor rendered nothing while its OWN content doc held ${data.docLength} characters. \`@lexical/yjs\` has no read-the-doc operation — a binding ingests its doc solely through post-attach \`observeDeep\` events — so a binding that attached to an already-populated doc, or that missed the events for content applied while it was detached, renders empty FOREVER while the doc and the server keep every character. This is the failure class the per-binding \`BindingReplica\` exists to make impossible.`;
    case "starved-doc":
      return `The content doc was EMPTY while the block's row projection held ${data.rowLength} characters that this client never typed. The row is written by whichever client is editing the block, so it is an independent witness that the block has content — and this client's doc never received it. The doc is hydrated by the \`page-block-doc\` live-state push (plus its own doc-init response), so a missed push leaves the doc permanently short of the server with nothing to notice it.`;
  }
}
