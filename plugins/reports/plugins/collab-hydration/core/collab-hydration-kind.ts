import { z } from "zod";

// The collab-hydration report payload, stored in the generic `data` jsonb column
// and validated on ingest by the collab-hydration ReportKind. Mirrors
// `CollabHydrationReport`, the neutral body the page editor emits into
// `collabHydrationReportSink` when a block's rendered text stops agreeing with
// its content doc — this schema is the ingest-side contract for that shape.
//
// A block's text has exactly ONE owner: its per-block `Y.Doc`
// (`plugins/page/plugins/editor/CLAUDE.md`, "Text is doc-owned"). The editor is
// a VIEW of that doc, hydrated exclusively through the update events
// `@lexical/yjs` fires after its binding attaches — so a view can fall behind
// its doc, and a doc can fall behind the server, with nothing to notice either.
// This report is that notice; the editor recovers in place before emitting it.
export const CollabHydrationPayloadSchema = z.object({
  // Which side was behind. `blind-binding` = the editor rendered less than its
  // own doc holds (the binding missed its post-attach events). `starved-doc` =
  // the doc itself was behind the server: the row projection held text this
  // client never typed, so the `page-block-doc` push never arrived.
  reason: z.enum(["blind-binding", "starved-doc"]),
  // Volatile uuid — deliberately excluded from the fingerprint.
  blockId: z.string(),
  // The three independent witnesses of the block's content at the moment of
  // detection: what was rendered, what the doc held, what the row held. Their
  // disagreement IS the defect, and which pair disagrees says where to look.
  shownLength: z.number(),
  docLength: z.number(),
  rowLength: z.number(),
});
export type CollabHydrationPayload = z.infer<typeof CollabHydrationPayloadSchema>;

// Fingerprint = sha256("collab-hydration" + reason), first 16 hex chars. Only
// the reason: the block id is a fresh uuid per occurrence and the three lengths
// are however much text the user happened to have, so including any of them
// would split one defect across a new `_reports` row per keystroke burst. The
// two reasons are genuinely different bugs (a view that missed its events vs a
// doc that missed its push) and deserve separate rows.
export async function collabHydrationFingerprint(
  data: CollabHydrationPayload,
): Promise<string> {
  return sha256Hex(`collab-hydration|${data.reason}`).then((h) => h.slice(0, 16));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
