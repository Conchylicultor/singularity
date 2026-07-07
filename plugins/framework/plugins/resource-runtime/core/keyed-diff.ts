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

/**
 * The membership-scope inputs to `diffKeyedScopedMembership`: the id sets that
 * frame a single flush's row-level change for a `scopedMembership` keyed
 * resource. See `research/2026-07-03-global-scoped-membership-m5.md`.
 *
 * - `requestedIds` — the ids the loader was asked to refill (op-I ∪ op-U ids). An
 *   id present here but ABSENT from `refillRows` is a membership EXIT (its
 *   mutable-`where` flipped to false, or it was concurrently deleted).
 * - `deletedIds` — op-D ids. Never queried (a deleted row can't be refilled); an
 *   id here that is in `prev` is an EXIT, listed in `deletes`.
 * - `orderedIds` — the full ORDER BY'd id list from the resource's `orderOf`,
 *   supplied ONLY when the refill ENTERED at least one id not already in `prev`
 *   (an entry needs an authoritative placement). Absent for an exit-only or
 *   in-place change: the order is then derived from the prior snapshot minus the
 *   exits, so no `orderOf` query runs.
 */
export interface KeyedMembershipInput {
  requestedIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
  orderedIds?: readonly string[];
}

/**
 * Membership-aware scoped diff (M5): the counterpart to `diffKeyedScoped` for a
 * keyed resource that opted into row-level INSERT/DELETE/where-flip scoping.
 * `refillRows` is a PARTIAL array — only the `requestedIds` the loader
 * re-selected — so this both merges those rows in AND resolves membership
 * exits/entries against `prev`, returning a delta that MAY assert `order`
 * (unlike `diffKeyedScoped`, which never does). Pure — never mutates `prev`.
 *
 * Wire contract (see `keyed-delta-merge.ts`): the client rebuilds the keyed array
 * PURELY from `order`, so any membership change MUST ship the full `order`; and an
 * `order` id resolvable from neither the `upserts` nor the client's base forces a
 * drift-resub. Both are honored here — `nextSnapshot` is rebuilt FROM `order` so
 * snapshot ≡ wire order, and `upserts`/`order` are sanitized to the surviving ids.
 *
 * Algorithm:
 *   1. Merge `refillRows` into a copy of `prev`; a changed/new row is an upsert.
 *   2. Exits = ids in (`requestedIds` ∪ `deletedIds`) that are in `prev` but were
 *      NOT returned by the refill → removed from the snapshot, listed in `deletes`.
 *   3. Entries = refill ids absent from `prev`. No entries AND no exits ⇒ Case A:
 *      `{ upserts, deletes: [], order: undefined }` — the exact `diffKeyedScoped`
 *      shape (in-place upserts, membership/order unchanged).
 *   4. Otherwise membership changed. The order SOURCE is `orderedIds` when
 *      supplied (an entry happened), else the prior snapshot order (exit-only).
 *      `finalOrder = orderSource.filter(id => merged.has(id))` drops ids the order
 *      source no longer agrees on (an `orderedIds` id absent from the merge, or a
 *      merged id concurrently deleted out of `orderedIds`); `nextSnapshot` is
 *      rebuilt from `finalOrder`; `upserts` are filtered to the survivors.
 */
export function diffKeyedScopedMembership(
  prev: KeyedSnapshot,
  refillRows: readonly unknown[],
  input: KeyedMembershipInput,
  keyOf: (row: unknown) => string,
): {
  upserts: [string, unknown][];
  deletes: string[];
  order: string[] | undefined;
  nextSnapshot: Map<string, string>;
} {
  const { requestedIds, deletedIds, orderedIds } = input;

  // (1) Merge the partial refill into a copy of prev. A row whose hash differs
  // (changed) or is absent (new) is an upsert; carried-over rows stay intact.
  const merged = new Map<string, string>(prev);
  const upserts: [string, unknown][] = [];
  const refillIds = new Set<string>();
  for (const row of refillRows) {
    const id = keyOf(row);
    refillIds.add(id);
    const hash = JSON.stringify(row);
    if (merged.get(id) !== hash) {
      upserts.push([id, row]);
      merged.set(id, hash);
    }
  }

  // (2) Exits: a requested/deleted id that WAS a member but the refill did not
  // return (where-flip to false, or a concurrent delete). Deduped across the two
  // sets — an id can appear in both (insert-then-delete coalesced in one flush).
  const deletes: string[] = [];
  const exitCandidates = new Set<string>();
  for (const id of requestedIds) exitCandidates.add(id);
  for (const id of deletedIds) exitCandidates.add(id);
  for (const id of exitCandidates) {
    if (prev.has(id) && !refillIds.has(id)) {
      merged.delete(id);
      deletes.push(id);
    }
  }

  // (3) Entries: a refilled id that was not previously a member.
  let entered = false;
  for (const id of refillIds) {
    if (!prev.has(id)) {
      entered = true;
      break;
    }
  }

  // Case A: no membership change — identical shape to `diffKeyedScoped`. `merged`
  // preserves prev's key order (no add/remove), so `order` is correctly omitted.
  if (!entered && deletes.length === 0) {
    return { upserts, deletes: [], order: undefined, nextSnapshot: merged };
  }

  // (4) Membership changed. Order source = the caller's authoritative list when an
  // entry happened (needs placement), else prev order minus exits (exit-only).
  // An entry WITHOUT `orderedIds` is a caller-contract violation: falling back to
  // the prior order would silently drop the entering row from both the wire and
  // the snapshot — an invisible data loss. Fail loudly instead.
  if (entered && orderedIds === undefined) {
    throw new Error(
      "diffKeyedScopedMembership: a refilled id entered membership but no orderedIds " +
        "was supplied — the caller must run orderOf whenever the refill returns an " +
        "id absent from the prior snapshot",
    );
  }
  const orderSource = orderedIds ?? [...prev.keys()];
  const finalOrder = orderSource.filter((id) => merged.has(id));
  // Rebuild the snapshot FROM finalOrder so snapshot ≡ wire order. Any merged id
  // not in finalOrder (an `orderedIds` disagreement / concurrent delete) drops out
  // — its own feed event later becomes a no-op.
  const survivors = new Set(finalOrder);
  const nextSnapshot = new Map<string, string>();
  for (const id of finalOrder) nextSnapshot.set(id, merged.get(id)!);
  const survivingUpserts = upserts.filter(([id]) => survivors.has(id));
  return { upserts: survivingUpserts, deletes, order: finalOrder, nextSnapshot };
}
