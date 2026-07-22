import { z } from "zod";

// The turn-unconfirmed report payload, stored in the generic `data` jsonb
// column and validated on ingest by the turn-unconfirmed ReportKind. Emitted by
// the conversations pending-turn state machine when a sent turn was POSTed and
// acked (2xx) but its text never appeared in the transcript within the
// confirmation window — the silent paste-race symptom.
export const TurnUnconfirmedPayloadSchema = z.object({
  // The conversation whose transcript never confirmed the turn.
  conversationId: z.string(),
  // A bounded preview of the unconfirmed message text (the emitter truncates —
  // never the full, unbounded prompt).
  textPreview: z.string(),
  // How long the owner tab waited before declaring the turn unconfirmed.
  // Volatile — deliberately excluded from the fingerprint.
  elapsedMs: z.number(),
});
export type TurnUnconfirmedPayload = z.infer<typeof TurnUnconfirmedPayloadSchema>;

// Turn-unconfirmed fingerprint = sha256(conversationId), first 16 hex chars.
// `textPreview` and `elapsedMs` are EXCLUDED: every unconfirmed turn on one
// conversation is one broken delivery path, not N distinct findings — repeats
// on the same conversation must collapse onto a single row rather than filing
// one row per attempted message.
export async function turnUnconfirmedFingerprint(
  data: TurnUnconfirmedPayload,
): Promise<string> {
  return sha256Hex(data.conversationId).then((h) => h.slice(0, 16));
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
