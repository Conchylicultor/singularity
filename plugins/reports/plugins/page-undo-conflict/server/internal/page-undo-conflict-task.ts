import type { ReportRow } from "@plugins/reports/server";
import { PageUndoConflictPayloadSchema } from "../../core";
import type { PageUndoConflictPayload } from "../../core";

// Notification re-arm window: a stale entry clobbered someone's text, and an
// aborted run cost the user an undo step they may have noticed, so it
// resurfaces every 6h rather than once-forever — same policy as caret-flight /
// collab-hydration / optimistic-divergence.
export const PAGE_UNDO_CONFLICT_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const PLAN_DOC = "research/2026-09-09-page-data-based-text-undo-entries-v2.md";

function payloadOf(row: ReportRow): PageUndoConflictPayload {
  // Validated by PageUndoConflictPayloadSchema at ingest, so this is a total
  // parse; failure would be a corrupted row (surfaced loudly).
  return PageUndoConflictPayloadSchema.parse(row.data);
}

export function renderPageUndoConflictTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const what =
    data.reason === "stale-entry"
      ? `${data.direction ?? "undo"} replay applied a stale text entry`
      : "typing run dropped by a remote change";
  const raw = `${noisePrefix}[page-undo-conflict] ${data.reason} — ${what}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(
    `A data-based text undo entry met a block that was not the one it recorded. A text entry captures a block's runs before and after a typing run and replays by writing the recorded side back — lossless only while the block has ONE writer between record and replay. Here a second writer (a server push, another client) landed in between. At detection: **expected ${data.expectedLength}**, **actual ${data.actualLength}** characters in block \`${data.blockId}\`${data.direction ? ` (${data.direction})` : ""}.`,
  );
  lines.push("");
  lines.push(`**What \`${data.reason}\` means**`);
  lines.push(reasonExplanation(data));
  lines.push("");
  lines.push(
    `**This is the designed residual, not a crash** — the policy is recorded in §5 of \`${PLAN_DOC}\` and the residual (a stale entry clobbers the second writer; an aborted run loses one undo step) in \`plugins/page/plugins/editor/CLAUDE.md\`. It is acceptable only while it stays rare, and this report is the measurement. A rising count is the signal to take the upgrade path: a runs-level 3-way merge at replay instead of a blind write of the recorded side.`,
  );
  lines.push("");
  lines.push(`**How to investigate**`);
  lines.push(
    `1. Read §2.4 (the replay origin), §5 (concurrency policy) and §6 (this report) of \`${PLAN_DOC}\`, then the undo section of \`plugins/page/plugins/editor/CLAUDE.md\`.`,
  );
  lines.push(
    data.reason === "stale-entry"
      ? `2. Establish who the second writer was: another client on the same page, a server-side apply (an agent's \`edit_page\`, markdown-apply), or this client's own projection echoing back. The last would be a bug in the local-origin rule — an echo of the client's own flush must never register as a foreign write.`
      : `2. Establish what landed mid-run: a genuine remote edit at a concurrent moment (expected, rare) or a hydration push arriving while a run was open (worth checking the open-run gating against the doc's sync state). If the count rises without a second client on the page, the abort is misclassifying local transactions as non-local.`,
  );
  lines.push(
    `3. Reproduce with two clients on one page: \`plugins/page/plugins/editor/e2e/\` holds the two-client drivers; type in one client, edit the same block from the other, then undo in the first.`,
  );
  lines.push("");
  lines.push(`**Block**`);
  lines.push(`- **Block id:** \`${data.blockId}\``);
  lines.push(
    `- **Direction:** ${data.direction ?? "— (recording, not replaying)"}`,
  );
  lines.push(
    `- **Expected / actual:** ${data.expectedLength} / ${data.actualLength}`,
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
  return lines.join("\n");
}

function reasonExplanation(data: PageUndoConflictPayload): string {
  switch (data.reason) {
    case "stale-entry":
      return `The ${data.direction ?? "undo"} replay compared the block's current runs to what the entry recorded (\`after\` on undo, \`before\` on redo) and found ${data.actualLength} characters where it expected ${data.expectedLength}. Under single-writer LIFO those always match, so the mismatch is a genuine second writer between record and replay. The entry was applied ANYWAY — the user asked for their undo — which overwrote whatever the second writer had put there. This report is what makes that overwrite measurable instead of silent.`;
    case "run-aborted":
      return `A remote apply landed inside an open typing run (the run had started from ${data.expectedLength} characters; the block held ${data.actualLength} after the remote change). Closing the run would have recorded an entry whose \`after\` carried the remote text as if the user had typed it, and undoing it would have destroyed that text — so the run was dropped instead. One undo step is lost at a genuinely concurrent moment; nothing destructive was recorded. The same guard covers the hydration window.`;
  }
}
