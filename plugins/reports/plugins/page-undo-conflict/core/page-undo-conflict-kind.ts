import { z } from "zod";

// The page-undo-conflict report payload, stored in the generic `data` jsonb
// column and validated on ingest by the page-undo-conflict ReportKind. Mirrors
// `UndoConflictReport`, the neutral body the page editor emits into
// `undoConflictReportSink` when a data-based text undo entry meets a block that
// is not the one it recorded — this schema is the ingest-side contract for that
// shape (design: §5/§6 of
// `research/2026-09-09-page-data-based-text-undo-entries-v2.md`).
//
// A text undo entry records the block's runs before and after a typing run and
// replays by writing the recorded side back. That is only lossless while the
// block has ONE writer between record and replay; a second writer (a server
// push, another client) is what both arms of this report describe.
export const PageUndoConflictPayloadSchema = z.object({
  // Which conflict. `stale-entry` = a replay found text other than what the
  // entry recorded, and applied the entry anyway (clobbering the second
  // writer). `run-aborted` = a remote apply landed inside an open typing run,
  // so the run was dropped instead of being recorded as a destructive entry.
  reason: z.enum(["stale-entry", "run-aborted"]),
  // Volatile uuid — deliberately excluded from the fingerprint.
  blockId: z.string(),
  // The replay's direction for `stale-entry`; `null` for `run-aborted`, which
  // happens while recording, not while replaying.
  direction: z.enum(["undo", "redo"]).nullable(),
  // What the entry (or the open run) expected the block to hold, against what
  // it actually held. Their disagreement IS the conflict.
  expectedLength: z.number(),
  actualLength: z.number(),
});
export type PageUndoConflictPayload = z.infer<
  typeof PageUndoConflictPayloadSchema
>;

// Fingerprint = sha256("page-undo-conflict" + reason), first 16 hex chars. Only
// the reason: the block id is a fresh uuid per occurrence, the direction is
// whichever key the user pressed, and the two lengths are however much text the
// block happened to hold — including any of them would split one defect across
// a new `_reports` row per keystroke. The two reasons are genuinely different
// situations (an entry applied over a second writer vs a run dropped to avoid
// recording one) and deserve separate rows.
export async function pageUndoConflictFingerprint(
  data: PageUndoConflictPayload,
): Promise<string> {
  return sha256Hex(`page-undo-conflict|${data.reason}`).then((h) =>
    h.slice(0, 16),
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
