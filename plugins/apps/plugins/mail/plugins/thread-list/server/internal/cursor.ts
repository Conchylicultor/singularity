// Opaque keyset cursor for the thread list. It encodes the sort key of the last
// row of a page — the epoch-millis of `COALESCE(last_message_at, created_at)`
// plus the thread id as the tie-break — as base64url(`${sortMs}:${id}`). The
// server seeks strictly past it (`sortMs < :sortMs OR (= AND id < :id)`), so
// paging never repeats or skips a row at a stable sort key.
//
// `sortMs` is always the numeric prefix up to the FIRST colon; the id (which may
// itself contain colons, though Gmail ids don't) is everything after it.
export function encodeThreadCursor(sortMs: number, id: string): string {
  return Buffer.from(`${sortMs}:${id}`).toString("base64url");
}

export function decodeThreadCursor(cursor: string): { sortMs: number; id: string } {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const sep = raw.indexOf(":");
  if (sep === -1) {
    throw new Error(`Malformed mail thread cursor (no separator): ${cursor}`);
  }
  const sortMs = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (!Number.isFinite(sortMs) || id.length === 0) {
    throw new Error(`Malformed mail thread cursor: ${cursor}`);
  }
  return { sortMs, id };
}
