// Pure keyed-delta diff core. Extracted from `createResourceRuntime` so the
// server-side producer of the `(upserts, deletes, order)` deltas — the
// counterpart to the client `mergeKeyedDelta` consumer in
// `@plugins/primitives/plugins/live-state/web/keyed-delta-merge.ts` — is named,
// isolated, and fuzzable without standing up a socket or a registry.
//
// A keyed-mode array resource keeps a per-`(key,params)` snapshot of id→hash
// (the hash is the row's canonical JSON, computed identically on every path).
// On a notify the runtime re-runs the loader, diffs the new array against that
// snapshot by row id, and broadcasts only the changed rows + the id order — so
// a single-row change ships one row instead of the whole list. This module owns
// that diff. The runtime owns the snapshot *storage* (the `Map<pk, snapshot>`):
// these functions take the prior snapshot in and hand the next snapshot back,
// staying pure (no I/O, no mutation of their inputs).

/** A keyed snapshot: row id → canonical-JSON hash, in array order. */
export type KeyedSnapshot = ReadonlyMap<string, string>;

export interface KeyedDiff {
  upserts: [string, unknown][];
  deletes: string[];
  /**
   * The full ordered id list, OR `undefined` when order/membership are
   * unchanged (the common in-place-update case: a status/title flip on one
   * row). The snapshot Map is built from `value` in order, so iterating the
   * prior snapshot's keys yields the prior order; when it matches the new order
   * element-for-element we omit it from the wire. An omitted `order` strictly
   * means "in-place upserts, membership/order unchanged" — `deletes` is then
   * necessarily empty and there are no brand-new ids.
   */
  order: string[] | undefined;
  /**
   * False only when there was no prior snapshot (first notify for this pk).
   * Callers ship a full update in that case so brand-new clients get a complete
   * base.
   */
  hadSnapshot: boolean;
}

/** Build the id→hash map for a keyed resource's array `value`, in array order. */
export function buildSnapshot(
  value: readonly unknown[],
  keyOf: (row: unknown) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of value) map.set(keyOf(row), JSON.stringify(row));
  return map;
}

/**
 * Full diff: compare the new array `value` against `prev` (the prior snapshot,
 * or `undefined` on first notify). Returns the wire `KeyedDiff` plus the freshly
 * computed `nextSnapshot` the caller stores in place of `prev`. Pure — does not
 * mutate `prev`.
 *
 * - `upserts` = every row whose content-hash differs from `prev` (a change) or
 *   is absent from `prev` (a new row).
 * - `deletes` = every id in `prev` not present in the new array.
 * - `order` = the full new id list, OR `undefined` when it is element-for-element
 *   identical to the prior order (in-place update, membership/order unchanged).
 */
export function diffKeyedFull(
  prev: KeyedSnapshot | undefined,
  value: readonly unknown[],
  keyOf: (row: unknown) => string,
): { diff: KeyedDiff; nextSnapshot: Map<string, string> } {
  const hadSnapshot = prev !== undefined;
  // Map preserves insertion order, and the snapshot was built from the prior
  // `value` in order, so its key iteration order is the prior id order.
  const prevOrder = prev ? [...prev.keys()] : undefined;
  const next = new Map<string, string>();
  const upserts: [string, unknown][] = [];
  const order: string[] = [];
  for (const row of value) {
    const id = keyOf(row);
    const hash = JSON.stringify(row);
    next.set(id, hash);
    order.push(id);
    if (!prev || prev.get(id) !== hash) upserts.push([id, row]);
  }
  const deletes: string[] = [];
  if (prev) {
    for (const id of prev.keys()) if (!next.has(id)) deletes.push(id);
  }
  // Omit `order` when the id sequence is identical to the prior one — a delete
  // or insert changes membership ⇒ length/sequence differs ⇒ order is sent.
  const orderUnchanged =
    prevOrder !== undefined &&
    prevOrder.length === order.length &&
    prevOrder.every((id, i) => id === order[i]);
  return {
    diff: { upserts, deletes, order: orderUnchanged ? undefined : order, hadSnapshot },
    nextSnapshot: next,
  };
}

/**
 * Scoped diff (Layer 2): `scopedRows` is a PARTIAL array — only the recomputed
 * affected rows. The changed rows are MERGED into a copy of `prev` (never a
 * replace): each row whose hash differs becomes an upsert and its hash is
 * written into `nextSnapshot`; rows not in `scopedRows` are carried over intact.
 * `deletes` is necessarily empty and `order` is undefined — a scoped notify
 * never asserts membership/order. Pure — does not mutate `prev`.
 *
 * Precondition: a `prev` snapshot exists (the caller only enters the scoped path
 * when a snapshot was already seeded). Returns the partial-update upserts plus
 * the merged `nextSnapshot`.
 */
export function diffKeyedScoped(
  prev: KeyedSnapshot,
  scopedRows: readonly unknown[],
  keyOf: (row: unknown) => string,
): { upserts: [string, unknown][]; nextSnapshot: Map<string, string> } {
  const next = new Map<string, string>(prev);
  const upserts: [string, unknown][] = [];
  for (const row of scopedRows) {
    const id = keyOf(row);
    const hash = JSON.stringify(row);
    if (next.get(id) !== hash) {
      upserts.push([id, row]);
      next.set(id, hash);
    }
  }
  return { upserts, nextSnapshot: next };
}
