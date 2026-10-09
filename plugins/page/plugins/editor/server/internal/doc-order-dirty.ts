import type { PageForestTx, PageScope } from "./page-forest";

/**
 * The sidebar groups (`page_id` partitions) a locked transaction has written
 * something STRUCTURAL into — the partitions whose `doc_rank` order may no
 * longer equal document order, and which `withPageForest` therefore reconciles
 * before it commits (`doc-rank.ts`).
 *
 * Keyed by the transaction itself, and private to this module: the only way in
 * is {@link markDocOrderDirty}, called by the LOWEST-level forest mutators
 * (`forest-writer.ts`'s column writers and `recomputePageIdSubtree`), so every
 * composite writer above them — the op and patch handlers, moves, trash,
 * restore, turn-into-page, history restore — inherits the mark without knowing
 * it exists. A writer added later that goes through those mutators is covered
 * the same way; one that does not cannot write `page_blocks` at all
 * (`page-editor/no-adhoc-forest-write`).
 *
 * A `WeakMap`, so a transaction that throws before the reconcile leaves nothing
 * behind to leak or to be mistaken for the next transaction's marks.
 */
const dirty = new WeakMap<PageForestTx, Set<PageScope>>();

/** Record that `tx` changed the placement of rows in these partitions. */
export function markDocOrderDirty(
  tx: PageForestTx,
  scopes: Iterable<PageScope>,
): void {
  let set = dirty.get(tx);
  if (!set) {
    set = new Set();
    dirty.set(tx, set);
  }
  for (const scope of scopes) set.add(scope);
}

/**
 * The partitions `tx` marked, cleared as they are read — so a reconcile that
 * itself writes (it never marks) cannot see its own work, and a second call is
 * a no-op.
 */
export function takeDocOrderDirty(tx: PageForestTx): PageScope[] {
  const set = dirty.get(tx);
  dirty.delete(tx);
  return set ? [...set] : [];
}
