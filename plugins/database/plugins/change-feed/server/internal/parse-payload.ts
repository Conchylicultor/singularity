// Pure parser for a `live_state` NOTIFY payload. Kept separate from the listener
// so it can be unit-tested without a DB socket.
//
// The payload is the JSON emitted by `live_state_notify()`:
//   { "t": "<table>", "op": "I" | "U" | "D", "ids": string[] | null, "x": "<xid8>" }
// `op` is the first letter of TG_OP. `ids` is an array of PK values as strings,
// or null (composite/no PK, or an over-cap statement → FULL-for-table). `x` is
// the source transaction id (`pg_current_xact_id()::text` — the same xid8 the
// changelog row stores), threaded through the recompute cascade as the
// mutation-ack attribution (`ackTx`). Parsed TOLERANTLY: absent or malformed
// `x` (a pre-upgrade NOTIFY) yields `xid: null` — a missing ack is safe, a
// dropped change is not.
//
// Parsing is intentionally strict on shape but never throws: a malformed payload
// returns null so the listener can log + skip rather than crash. The change-feed
// must never be taken down by one bad message.

export type DbChange = {
  table: string;
  op: "I" | "U" | "D";
  ids: string[] | null;
  xid: string | null;
};

export function parseLiveStatePayload(raw: string): DbChange | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // A malformed payload is the expected bad case → skip. Anything that isn't a
    // JSON syntax error is unexpected and must fail loudly.
    if (!(err instanceof SyntaxError)) throw err;
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const table = obj.t;
  const op = obj.op;
  const ids = obj.ids;

  if (typeof table !== "string" || table.length === 0) return null;
  if (op !== "I" && op !== "U" && op !== "D") return null;

  let normalizedIds: string[] | null;
  if (ids === null || ids === undefined) {
    normalizedIds = null;
  } else if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
    normalizedIds = ids as string[];
  } else {
    // Present but wrong shape — bad payload, skip the whole change.
    return null;
  }

  // Tolerant: a pre-upgrade NOTIFY has no `x`; a malformed one degrades to null
  // (missing ack attribution is safe) rather than rejecting the change.
  const x = obj.x;
  const xid = typeof x === "string" && x.length > 0 ? x : null;

  return { table, op, ids: normalizedIds, xid };
}
