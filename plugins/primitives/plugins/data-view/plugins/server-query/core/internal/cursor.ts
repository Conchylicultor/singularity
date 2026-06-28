import type { SortRule } from "@plugins/primitives/plugins/data-view/core";

/**
 * The decoded keyset cursor: the last-seen row's sort-key tuple (`v`, in key
 * order) plus the sort `s`ignature it was produced under. The signature lets the
 * server reject a cursor whose sort no longer matches the request (a stale
 * cursor would otherwise seek against the wrong key tuple → dup/skip rows).
 *
 * `v` holds the *revived* values after `decodeCursor` — `Date`s are real `Date`
 * objects again; numbers / strings / `null` pass through unchanged.
 */
export interface CursorPayload {
  /** Sort-key tuple values, in key order (Dates revived). */
  v: unknown[];
  /** Sort signature this cursor was minted under (see `sortSignature`). */
  s: string;
}

/**
 * Stable, order-sensitive string identity of a sort. Two `SortRule[]`s produce
 * the same signature iff they are the same fields in the same order with the
 * same directions — so it doubles as the keyset-validity token stamped into the
 * cursor.
 */
export function sortSignature(sort: SortRule[]): string {
  return sort.map((r) => `${r.fieldId}:${r.direction}`).join(",");
}

/** Tagged wire form for a `Date`, so the JSON round-trip survives a revive. */
interface TaggedDate {
  __d: string;
}

function isTaggedDate(x: unknown): x is TaggedDate {
  return (
    typeof x === "object" &&
    x !== null &&
    "__d" in x &&
    typeof (x as { __d: unknown }).__d === "string" &&
    Object.keys(x).length === 1
  );
}

/** Replace top-level `Date`s in a tuple with their tagged wire form. */
function toWire(values: unknown[]): unknown[] {
  return values.map((v) => (v instanceof Date ? { __d: v.toISOString() } : v));
}

/** Revive tagged dates in a decoded tuple back into `Date`s. */
function fromWire(values: unknown[]): unknown[] {
  return values.map((v) => (isTaggedDate(v) ? new Date(v.__d) : v));
}

/**
 * Encode a keyset cursor: base64url(JSON) of `{ v: <tagged tuple>, s: sig }`.
 * `Date`s are serialized as `{ __d: isoString }`; numbers / strings / `null`
 * pass through. Browser-safe (`Buffer` is available in this Bun runtime).
 */
export function encodeCursor(values: unknown[], sortSig: string): string {
  const wire: CursorPayload = { v: toWire(values), s: sortSig };
  return Buffer.from(JSON.stringify(wire)).toString("base64url");
}

/**
 * Decode a cursor produced by `encodeCursor`. Revives tagged `Date`s; throws on
 * malformed input (fail loud — a bad cursor is a bug, not a recoverable state).
 */
export function decodeCursor(raw: string): CursorPayload {
  const json = Buffer.from(raw, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { v?: unknown }).v) ||
    typeof (parsed as { s?: unknown }).s !== "string"
  ) {
    throw new Error("Invalid cursor payload");
  }
  const { v, s } = parsed as { v: unknown[]; s: string };
  return { v: fromWire(v), s };
}
