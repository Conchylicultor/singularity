import { z } from "zod";

// The caret-flight report payload, stored in the generic `data` jsonb column and
// validated on ingest by the caret-flight ReportKind. Mirrors
// `CaretFlightAbortReport`, the neutral body the page editor's caret authority
// emits into `caretFlightReportSink` when a claimed caret landing is given up on
// — this schema is the ingest-side contract for that same shape.
//
// The authority holds ONE authoritative caret location and takes the keyboard
// while the caret is in flight to a block whose editor has not mounted yet (see
// `plugins/page/plugins/editor/CLAUDE.md`). An abort means that landing never
// happened, so the keystrokes it was holding were replayed back into the block
// the user came from — or, when nothing could take them, lost.
export const CaretFlightPayloadSchema = z.object({
  // Why the landing was given up on. `target-never-rendered` = the block was
  // never rendered as a visible line (a refused op, or a target inside a
  // collapsed ancestor); `focus-left-surface` = focus moved out of the block
  // list; `target-cannot-hold-input` = the target mounted but is a void block
  // with nowhere to put typed characters; `surface-detached` = the editor
  // unmounted mid-flight; `landing-focus-lost` = the target's own landing policy
  // reported the landing abandoned (a hydrating editor took DOM focus, and focus
  // had moved off its root by the time its content arrived) — a steal the
  // `focusout` bound cannot see because it stayed inside the block list.
  reason: z.enum([
    "target-never-rendered",
    "focus-left-surface",
    "target-cannot-hold-input",
    "surface-detached",
    "landing-focus-lost",
  ]),
  // The block the caret was flying to, and the one it left. Both are volatile
  // uuids — deliberately excluded from the fingerprint.
  targetId: z.string(),
  originId: z.string().nullable(),
  // How many input units (characters + structural keys) were being held.
  buffered: z.number(),
  // Where the buffer was replayed, or null when nothing could take it — the
  // difference between "the user's typing went somewhere sane" and "it was
  // lost", which is why it is part of the fingerprint.
  replayedInto: z.string().nullable(),
});
export type CaretFlightPayload = z.infer<typeof CaretFlightPayloadSchema>;

// Fingerprint = sha256("caret-flight" + reason + recovered|lost), first 16 hex
// chars. The block ids are excluded: they are fresh uuids on every occurrence, so
// including either would split one bug across a new `_reports` row per keystroke
// burst. `buffered` is excluded for the same reason (it is however many
// characters the user happened to type). What IS kept is whether the buffer
// found a home — a lost buffer is a different, worse bug than a recovered one
// and deserves its own row.
export async function caretFlightFingerprint(
  data: CaretFlightPayload,
): Promise<string> {
  const outcome = data.replayedInto === null ? "lost" : "recovered";
  return sha256Hex(`caret-flight|${data.reason}|${outcome}`).then((h) =>
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
