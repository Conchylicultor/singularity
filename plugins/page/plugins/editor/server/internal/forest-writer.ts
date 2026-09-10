import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { recordTrashEntry } from "@plugins/infra/plugins/trash/server";
import { planForestInsert } from "../../core/block-forest";
import {
  withMintedIds,
  type SerializedBlock,
} from "../../core/serialized-block";
import { textOf, type BlockNode } from "../../core/block-ops";
import type { Block } from "../../core/schemas";
import { PAGE_BLOCK_TYPE, PAGE_BLOCKS_TRASH_SOURCE } from "../../core/schemas";
import { namesField, type BlockFieldChanges } from "../../core/block-diff";
import { _blocks } from "./tables";
import type { BlockRow } from "./forest";
import { parseBlockData } from "./parse-block-data";
import { reconcileBlocks } from "./reconcile";
import { BlockLifecycle, type DeletedBlockRow } from "./document-hooks";
import type { PageForestCtx, PageForestTx } from "./page-forest";

/**
 * THE only module in the repo that may name `_blocks` in a MUTATION position.
 *
 * Every export takes a {@link PageForestTx} — a transaction proven to hold the
 * write lock on the pages it touches — as a required parameter, so an unlocked
 * forest write is a tsc error rather than a convention. The direct way around
 * that (importing `_blocks` and writing it by hand somewhere else) is closed by
 * the `page-editor/no-adhoc-forest-write` lint rule, which exempts this file
 * alone. Two halves of one guardrail; neither is sufficient.
 *
 * There are exactly TWO write shapes, and keeping them distinct is deliberate:
 *
 *  - {@link writeForestTarget} — the op handler's whole write. Reconcile
 *    before→after, persist the diff, trash the AUTHORITATIVE delete set.
 *  - {@link writeBlockPatch} — the patch handler's whole write. Rank-park, then
 *    the FIELD-SCOPED columns each update names. It must stay field-scoped: a
 *    "hand me the new forest" contract would regress `BlockPatch` back into
 *    whole-row writes, the exact thing
 *    `research/2026-07-28-page-block-write-ownership.md` removed.
 *
 * **No hard delete of live content.** Neither write shape ever `DELETE`s a row
 * the user can see: every delete is a trash — the rows are flagged under ONE
 * ledger entry per operation (`trashDeletedRows`), and their content docs, ext
 * side-tables and version history survive until purge. The real `DELETE`
 * ({@link deleteBlockRoots}) is reachable only from purge and from history
 * restore's content wipe ({@link deletePageContentRows}).
 * `research/2026-09-09-page-data-based-text-undo-entries-v2.md` §3.
 */

/** Every column an INSERT may name. `createdAt`/`updatedAt` default in the DB. */
export type NewBlockRow = typeof _blocks.$inferInsert;

/**
 * The columns a field-scoped UPDATE may name. `id` is excluded — identity is not
 * a field — and `createdAt` is excluded because a row is created once. Nothing
 * is stamped implicitly: the write says exactly what it changes, `updatedAt`
 * included, so a caller can never discover a column it did not author.
 */
export type BlockColumnChanges = Partial<Omit<NewBlockRow, "id" | "createdAt">>;

// ---------------------------------------------------------------------------
// Low-level column writers
// ---------------------------------------------------------------------------

/**
 * Insert rows in the given order. Callers must order parent-before-descendant —
 * `parent_id` is a self-FK.
 */
export async function insertBlocks(
  tx: PageForestTx,
  rows: NewBlockRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(_blocks).values(rows);
}

/** Write exactly the columns `changes` names onto one row. */
export async function updateBlockFields(
  tx: PageForestTx,
  id: string,
  changes: BlockColumnChanges,
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  await tx.update(_blocks).set(changes).where(eq(_blocks.id, id));
}

/**
 * HARD-delete a set of delete ROOTS; the self-FK `ON DELETE CASCADE` reclaims
 * their descendants (and their `page_block_docs`, ext side-tables, and
 * attachment links). Roots only — deleting every id would be redundant, not
 * safer.
 *
 * Reachable from PURGE only (`purgeTrashedBlocks`, the trash sources' deferred
 * hard delete). A user-facing delete never lands here — it is a trash
 * ({@link trashDeletedRows}), so the content survives for undo and for the
 * 30-day grace period.
 */
export async function deleteBlockRoots(
  tx: PageForestTx,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx.delete(_blocks).where(inArray(_blocks.id, ids));
}

/**
 * Wipe a page's LIVE, NON-page content rows — the history-restore path's clean
 * slate. Predicate-scoped rather than id-scoped on purpose: `replacePageContent`
 * genuinely means "everything this page owns", and enumerating the ids first
 * would only add a read for the predicate to restate. Excluding `type="page"`
 * preserves each sub-page SHELL and — because a soft delete never cascades — the
 * sub-page's own content, which the snapshot never captured; excluding trashed
 * rows leaves the trash intact.
 */
export async function deletePageContentRows(
  tx: PageForestTx,
  pageId: string,
): Promise<void> {
  await tx
    .delete(_blocks)
    .where(
      and(
        eq(_blocks.pageId, pageId),
        ne(_blocks.type, PAGE_BLOCK_TYPE),
        isNull(_blocks.deletedAt),
      ),
    );
}

/**
 * SOFT-delete (trash) a set of rows under one ledger entry. Only rows still LIVE
 * are flagged, so an already-trashed nested page keeps its own entry's ownership
 * and restoring the outer entry leaves the inner one trashed.
 */
export async function trashBlockRoots(
  tx: PageForestTx,
  ids: string[],
  entryId: string,
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(_blocks)
    .set({ deletedAt: new Date(), trashEntryId: entryId })
    .where(and(inArray(_blocks.id, ids), isNull(_blocks.deletedAt)));
}

/**
 * Clear the trash flags on a set of rows, leaving every other column alone —
 * the subtree-internal half of a restore, whose `(parent_id, rank)` pairs were
 * never contended (the subtree moved as one body). A ROOT whose slot may have
 * been taken while it was trashed is repaired by its caller through
 * {@link updateBlockFields} instead.
 */
export async function untrashBlockRoots(
  tx: PageForestTx,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(_blocks)
    .set({ deletedAt: null, trashEntryId: null })
    .where(inArray(_blocks.id, ids));
}

/**
 * Insert an id-less `SerializedBlock[]` forest under `parentId`, minting fresh
 * ids and ranks. The id/rank algebra is the pure `planForestInsert`; this is
 * the thin persistence loop over its planned nodes.
 *
 * Server-minted ids make this the HISTORY-RESTORE path, and nothing else:
 * `replacePageContent` is its one caller, and a restore genuinely has no client
 * prediction to agree with (it wipes the page and rebuilds it from a snapshot,
 * with fresh ids on purpose — see the invariant note there). Every *editing*
 * forest insert — paste and duplicate alike — rides a `BlockOp` whose forest
 * arrives with ids already minted by the client (`withMintedIds`), so the client
 * can overlay the result optimistically and the server's push is a confirmation.
 * Top-level nodes use the caller-provided `rootRanks` (one per node); children
 * get a fresh open interval. Does not notify/emit — the caller does so once after
 * the surrounding transaction. Returns the new top-level ids in order.
 *
 * `pageId` is the resolved page scope for the inserted top-level nodes (their
 * nearest `type="page"` ancestor, i.e. `computePageId(parentId)`). Children
 * inherit it, except under a `type="page"` node, whose descendants are scoped to
 * that node's own id.
 */
export async function insertForest(
  tx: PageForestTx,
  args: {
    pageId: string | null;
    parentId: string | null;
    rootRanks: Rank[];
    forest: SerializedBlock[];
  },
): Promise<{ rootIds: string[] }> {
  const { nodes, rootIds } = planForestInsert({
    ...args,
    forest: withMintedIds(args.forest),
  });
  // Planned nodes are parent-before-descendant, so this insert order satisfies
  // the self-referential FK.
  await insertBlocks(
    tx,
    nodes.map((node) => ({
      id: node.id,
      pageId: node.pageId,
      parentId: node.parentId,
      type: node.type,
      data: parseBlockData(node.type, node.data),
      rank: node.rank,
      expanded: node.expanded,
    })),
  );
  return { rootIds };
}

// ---------------------------------------------------------------------------
// Park-then-place (the `(parent_id, rank)` unique-index protocol)
// ---------------------------------------------------------------------------

/** Where a row sits now, and the `(parentId, rank)` pair the batch will give it. */
export interface RankPlacement {
  id: string;
  /** The parent the row sits under right now — the scope it is parked in. */
  currentParentId: string | null;
  /** The parent it will sit under after phase 2. */
  parentId: string | null;
  /** The final rank, as the stored string. */
  rank: string;
}

/** The `(parentId, rank)` pair a row the batch will INSERT is going to occupy. */
export type IncomingPlacement = Pick<RankPlacement, "parentId" | "rank">;

/**
 * Phase 1 of **park-then-place**: bump every row in `placements` to a scratch
 * ("park") rank *under the parent it already sits below*, chosen strictly
 * greater than every rank that will exist under that parent — both the ranks
 * stored there now and the final ranks this batch is about to write there. The
 * caller then runs its normal per-row UPDATE with the final `(parentId, rank)`
 * (phase 2), in any order.
 *
 * It permutes the non-deferrable `(parent_id, rank)` partial unique index, so it
 * is never legal unlocked — hence the {@link PageForestTx}.
 *
 * ## Why a scratch value is required
 *
 * `page_blocks` carries a per-tuple `UNIQUE NULLS NOT DISTINCT (parent_id,
 * rank)` index. It is **not** `DEFERRABLE` (drizzle cannot emit that), so every
 * single-row UPDATE is checked immediately. A batch that permutes ranks among
 * siblings therefore transiently duplicates a pair mid-loop:
 *
 * - the `bulkMove` op mints its `nBetween` window *excluding* the moving
 *   ids, so a computed key can equal a rank a still-unmoved sibling holds.
 *   (Under parent P with siblings `B="a1"`, `C="a2"`, `D="a3"`, moving `{B,D}`
 *   after `C`: the window `("a2", null)` yields `["a3","a4"]`, and `B → "a3"`
 *   lands while `D` still holds `"a3"`.)
 * - `handlePatchBlocks` writes client-computed rows verbatim; undoing a swap
 *   re-assigns two rows to each other's ranks.
 *
 * Re-ordering the UPDATEs cannot save either case: a 2-cycle (a plain swap) has
 * no safe order. Only a scratch value does.
 *
 * ## Why phase 2 is then unconditionally safe
 *
 * Let `floor(p) = max(every rank currently stored under p, every final rank the
 * batch writes under p)`, over both `placements` and `incoming`. Park keys under
 * `p` are `nBetween(floor(p), null, n)` — mutually distinct and each strictly
 * greater than `floor(p)`.
 *
 * - *Phase 1 is safe*: a park key exceeds every rank currently under `p`, and
 *   the keys are distinct, so no two parked rows meet.
 * - *Phase 2 is safe*: when a row is written to its final `(p, r)`, the only
 *   rows under `p` are (a) rows the batch never touched, whose ranks are
 *   `≤ floor(p)` but cannot equal `r` unless the caller handed two rows the
 *   same pair, and (b) still-parked rows, whose keys are `> floor(p) ≥ r`.
 *   Order within phase 2 is therefore irrelevant.
 *
 * Any collision that survives means the caller computed two identical final
 * pairs — a genuine bug, and the index fires loudly rather than silently
 * dropping an ordering.
 *
 * ## Why parking happens under the CURRENT parent
 *
 * Parking never rewrites `parent_id`. That keeps phase 1 free of foreign-key
 * order dependencies: a patch may reparent an existing row under a row the same
 * batch has not INSERTed yet, and parking it into that parent up front would
 * violate the self-FK. Vacating the row's old pair is all phase 1 owes phase 2,
 * and a pure rank bump does exactly that.
 *
 * Rows whose `(parentId, rank)` is unchanged need no parking — see
 * {@link pairChanged}; an UPDATE writing a row's own current pair is invisible
 * to the index.
 */
export async function parkRanks(
  tx: PageForestTx,
  args: {
    /** Existing rows being re-ranked and/or re-parented. */
    placements: RankPlacement[];
    /** Pairs the batch will INSERT afterwards. They only widen the floors. */
    incoming?: IncomingPlacement[];
  },
): Promise<void> {
  const { placements, incoming = [] } = args;
  if (placements.length === 0) return;

  // Final ranks landing under each parent — from re-ranked AND inserted rows.
  const finalsUnder = new Map<string | null, string[]>();
  for (const p of [...placements, ...incoming]) {
    const list = finalsUnder.get(p.parentId);
    if (list) list.push(p.rank);
    else finalsUnder.set(p.parentId, [p.rank]);
  }

  // Group the rows to park by the parent they currently live under.
  const parkedUnder = new Map<string | null, RankPlacement[]>();
  for (const p of placements) {
    const list = parkedUnder.get(p.currentParentId);
    if (list) list.push(p);
    else parkedUnder.set(p.currentParentId, [p]);
  }

  for (const [parentId, rows] of parkedUnder) {
    // Max rank CURRENTLY stored under this parent, over ALL its rows — including
    // ones this batch is moving, and (when the parent is a `page` block) its
    // content rows, which a page-scoped `loadPageBlocks` never returns.
    // `rank_text` is a C-collation domain, so byte order IS rank order.
    const [last] = await tx
      .select({ rank: _blocks.rank })
      .from(_blocks)
      .where(
        parentId === null
          ? isNull(_blocks.parentId)
          : eq(_blocks.parentId, parentId),
      )
      .orderBy(desc(_blocks.rank))
      .limit(1);

    const candidates = [...(finalsUnder.get(parentId) ?? [])];
    if (last) candidates.push(last.rank);
    // `rows` is non-empty and every parked row contributes its own final rank to
    // some parent, but not necessarily to THIS one (it may be moving away) — so
    // `last` is what guarantees a floor when the parent receives no finals. A
    // parent with a parked row always has at least that one row stored under it.
    const floor = candidates.reduce((a, b) => (a > b ? a : b));

    const park = Rank.nBetween(Rank.from(floor), null, rows.length);
    for (let i = 0; i < rows.length; i++) {
      await updateBlockFields(tx, rows[i]!.id, { rank: park[i]!.toJSON() });
    }
  }
}

/**
 * `true` when the batch moves a row off the `(parent_id, rank)` pair it
 * occupies — i.e. it must be parked before the final writes land.
 */
export function pairChanged(
  current: { parentId: string | null; rank: string },
  next: { parentId: string | null; rank: string },
): boolean {
  return current.parentId !== next.parentId || current.rank !== next.rank;
}

// ---------------------------------------------------------------------------
// The delete branch, shared by both write shapes
// ---------------------------------------------------------------------------

/**
 * What a forest write removed from the page's live content.
 *
 * Every removal is a TRASH, and the only question is WHERE it happens:
 *
 *  - a page-free delete set is trashed INLINE, in this write's own transaction
 *    (`trashDeletedRows`): one ledger entry in the `page-blocks` source, whose
 *    id is `trashedEntryId`. The hot path stays one transaction.
 *  - a delete set containing a `type="page"` row is DEFERRED: a page's own
 *    content lives in its own `page_id` partition under its own lock, which
 *    this transaction does not hold, so the caller routes `deleteRootIds`
 *    through `deleteBlocksSubtree` (which takes every page lock it needs) AFTER
 *    the transaction. `deferredToChokepoint` is a real branch, not a flag to
 *    ignore — a page silently cascading here is the 2026-07-10 data-loss bug.
 *
 * `OnDelete` fires on neither: nothing here is hard-deleted.
 */
export interface ForestWriteResult {
  /** Rows removed from the page's live content, AUTHORITATIVE (reconciled under the lock). */
  deletedRows: DeletedBlockRow[];
  /** Deleted ids whose parent is not itself deleted — the cascade roots. */
  deleteRootIds: string[];
  /**
   * The delete set contained a page row, so it was NOT trashed here — the
   * caller must hand `deleteRootIds` to `deleteBlocksSubtree` after commit.
   */
  deferredToChokepoint: boolean;
  /**
   * The `page-blocks` ledger entry this write minted for its delete set, or
   * `null` when the set was empty or deferred. Non-null ⇔ rows were trashed
   * inline — exactly when the caller has a handle to offer as "Undo".
   */
  trashedEntryId: string | null;
}

/** Deleted ids whose parent is not itself being deleted. */
function deleteRootsOf(deleted: DeletedBlockRow[]): string[] {
  const ids = new Set(deleted.map((r) => r.id));
  return deleted
    .filter((r) => r.parentId === null || !ids.has(r.parentId))
    .map((r) => r.id);
}

/**
 * The rows a delete set REALLY removes from a forest: the named ids plus every
 * live descendant of theirs in `forest`, in forest order. A hard delete used to
 * get this closure for free from the FK cascade; a trash flags exactly the ids
 * it is handed, so the writer must close the set itself — a descendant left
 * live under a trashed parent is unreachable by any read and unrestorable by
 * any entry. The forest is one page's live partition, so the closure cannot
 * cross into a sub-page's content: a `type="page"` row in it is what defers
 * the whole set to the chokepoint, which walks across page boundaries.
 */
function deleteClosureOf(
  forest: readonly DeletedBlockRow[],
  deleteIds: ReadonlySet<string>,
): DeletedBlockRow[] {
  const childrenOf = new Map<string, DeletedBlockRow[]>();
  for (const row of forest) {
    if (row.parentId === null) continue;
    const list = childrenOf.get(row.parentId);
    if (list) list.push(row);
    else childrenOf.set(row.parentId, [row]);
  }
  const removed = new Set<string>();
  const stack = forest.filter((r) => deleteIds.has(r.id)).map((r) => r.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (removed.has(id)) continue;
    removed.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return forest
    .filter((r) => removed.has(r.id))
    .map((r) => ({
      id: r.id,
      type: r.type,
      pageId: r.pageId,
      parentId: r.parentId,
    }));
}

/**
 * Run the `OnDelete` hooks over the AUTHORITATIVE delete set, inside the locked
 * transaction, on exactly the branch that really hard-deletes, exactly once.
 *
 * Hooks receive ROWS (not ids), which is what removed their need to be "before":
 * every contributor wants one fact — *which of these were page rows* — and
 * `row.type` answers it in memory, so the lock is held for zero extra I/O in
 * practice. Anything a hook genuinely must read pre-delete it reads on `ctx.tx`.
 * The returned callbacks are queued on `afterCommit`: re-push work (deindex,
 * version drops, backlink panels) must not hold the lock.
 */
export async function runOnDelete(
  ctx: PageForestCtx,
  rows: DeletedBlockRow[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const hook of BlockLifecycle.OnDelete.getContributions()) {
    const cb = await hook.onDelete(rows, ctx.tx);
    if (cb) ctx.afterCommit(cb);
  }
}

/**
 * Run the `OnTrash` hooks over a set of rows that were just flagged. Always
 * AFTER the trashing transaction commits (queue it on `ctx.afterCommit`): the
 * hooks do heavy re-derivation (search deindex, backlink edge deletes) that
 * must not hold the page locks.
 */
export async function runOnTrash(
  rows: readonly DeletedBlockRow[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const hook of BlockLifecycle.OnTrash.getContributions()) {
    await hook.onTrash(rows);
  }
}

/** The `OnRestore` twin of {@link runOnTrash}: after the restoring commit. */
export async function runOnRestore(
  rows: readonly DeletedBlockRow[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const hook of BlockLifecycle.OnRestore.getContributions()) {
    await hook.onRestore(rows);
  }
}

/** What a ledger entry is minted from — the arguments of `recordTrashEntry`. */
export interface TrashEntryArgs {
  sourceId: string;
  rootEntityId: string;
  label: string;
  meta: Record<string, unknown>;
}

/** The longest label a `page-blocks` entry carries; longer text is cut. */
const BLOCK_ENTRY_LABEL_MAX = 80;

/**
 * The ONE spelling of a `page-blocks` ledger entry — the anchor entry a delete
 * with no page root mints for its content rows. Shared by both write shapes
 * and by the chokepoint, so an entry cannot be labelled three ways:
 *
 *  - `rootEntityId` = the first delete root;
 *  - `label` = the first non-empty line of that root's text, cut to
 *    {@link BLOCK_ENTRY_LABEL_MAX}, else `"N blocks"` (a void block, or an
 *    empty one);
 *  - `meta` = `{ pageId, rootIds, count }`, so a future "Deleted blocks" UI can
 *    say where the rows came from without re-walking anything.
 */
export function pageBlocksTrashEntry(args: {
  pageId: string | null;
  /** The delete roots, first one first, with their stored `data`. */
  roots: readonly { id: string; data: unknown }[];
  /** Every row the operation trashes (roots + descendants). */
  count: number;
}): TrashEntryArgs {
  const first = args.roots[0];
  if (first === undefined) {
    throw new Error(
      "pageBlocksTrashEntry: a trash entry needs at least one root",
    );
  }
  const firstLine =
    textOf(first)
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const label =
    firstLine.length === 0
      ? `${args.count} block${args.count === 1 ? "" : "s"}`
      : firstLine.length > BLOCK_ENTRY_LABEL_MAX
        ? `${firstLine.slice(0, BLOCK_ENTRY_LABEL_MAX - 1)}…`
        : firstLine;
  return {
    sourceId: PAGE_BLOCKS_TRASH_SOURCE,
    rootEntityId: first.id,
    label,
    meta: {
      pageId: args.pageId,
      rootIds: args.roots.map((r) => r.id),
      count: args.count,
    },
  };
}

/**
 * Trash a delete set INLINE, inside the caller's locked transaction: record ONE
 * ledger entry, flag every row under it, and queue the `OnTrash` hooks for
 * after commit. Returns the entry id — the caller's undo handle.
 *
 * The ledger insert and the flag UPDATE share `ctx.tx`, which is what makes the
 * ledger invariant ("an entry exists ⇔ at least one row carries its id") hold
 * by construction on the trash side; `untrashBlocks` holds it on the restore
 * side by deleting the entry in the same transaction that clears the flags.
 * `rows` must be non-empty — an entry with no rows would violate it.
 */
export async function trashDeletedRows(
  ctx: PageForestCtx,
  rows: readonly DeletedBlockRow[],
  entry: TrashEntryArgs,
): Promise<string> {
  if (rows.length === 0) {
    throw new Error(
      "trashDeletedRows: refusing to mint a ledger entry with no rows",
    );
  }
  const entryId = await recordTrashEntry(ctx.tx, entry);
  await trashBlockRoots(
    ctx.tx,
    rows.map((r) => r.id),
    entryId,
  );
  ctx.afterCommit(() => runOnTrash(rows));
  return entryId;
}

// ---------------------------------------------------------------------------
// Write shape 1 — the op handler's reconcile-and-persist
// ---------------------------------------------------------------------------

/**
 * Reconcile `before` → `after`, persist the {insert, update, delete} diff, and
 * dispatch `OnDelete` over the set the transaction actually removes.
 *
 * The op reducers cannot cross a page boundary (the reparenting ops are refused
 * an out-of-page destination at the handler), so surviving nodes keep their
 * `pageId` and new nodes inherit it from their parent/sibling.
 *
 * **Rank parking is unconditional**, not per-op. `page_blocks` carries a
 * non-deferrable `(parent_id, rank)` unique index, so ANY batch that permutes
 * ranks among siblings transiently duplicates a pair mid-loop — a `bulkMove`
 * mints its window EXCLUDING the movers, so a computed key routinely equals a
 * rank a still-unmoved root holds. Several reducer arms hand-avoid this today by
 * minting strictly above the vacating row's own rank (`applyMerge`'s adoption,
 * `applyUnwrap`'s promotion, each with a comment saying so); parking makes the
 * write shape correct for every arm, present and future, instead of asking each
 * one to re-derive the collision argument. `pairChanged` filters it to rows that
 * really move, so the ops that permute nothing (a split, a text patch) pay for
 * no extra statement at all.
 */
export async function writeForestTarget(
  ctx: PageForestCtx,
  before: BlockNode[],
  after: BlockNode[],
): Promise<ForestWriteResult> {
  const { inserted, updated, deletedIds } = reconcileBlocks(before, after);

  // Closed under descendants (a reducer already removes a subtree whole, so
  // this is a no-op for it — the closure is the guarantee, not the common path).
  const deletedRows = deleteClosureOf(before, new Set(deletedIds));
  const deleteRootIds = deleteRootsOf(deletedRows);
  const deferredToChokepoint = deletedRows.some(
    (r) => r.type === PAGE_BLOCK_TYPE,
  );

  // Vacate every `(parent_id, rank)` pair this diff reassigns before any final
  // key lands, so the per-tuple unique index cannot fire on a transient
  // duplicate. Ordered first for `writeBlockPatch`'s reason: the inserts below
  // may take a pair a re-ranked row is moving off.
  const beforeById = new Map(before.map((n) => [n.id, n]));
  await parkRanks(ctx.tx, {
    placements: updated.flatMap(({ id, node }) => {
      const prev = beforeById.get(id)!;
      if (!pairChanged(prev, node)) return [];
      return [
        {
          id,
          currentParentId: prev.parentId,
          parentId: node.parentId,
          rank: node.rank,
        },
      ];
    }),
    incoming: inserted.map((node) => ({
      parentId: node.parentId,
      rank: node.rank,
    })),
  });

  const now = new Date();
  await insertBlocks(
    ctx.tx,
    inserted.map((node) => ({
      id: node.id,
      // In-page ops never change pageId; new nodes carry the pageId the
      // reducer already inherited from their parent/sibling.
      pageId: node.pageId,
      parentId: node.parentId,
      type: node.type,
      data: parseBlockData(node.type, node.data),
      rank: node.rank,
      expanded: node.expanded,
      createdAt: now,
      updatedAt: now,
    })),
  );

  for (const { id, node } of updated) {
    await updateBlockFields(ctx.tx, id, {
      parentId: node.parentId,
      type: node.type,
      data: parseBlockData(node.type, node.data),
      rank: node.rank,
      expanded: node.expanded,
      updatedAt: new Date(),
    });
  }

  // A page-free delete set is trashed inline, under ONE `page-blocks` entry
  // (the ranks above landed first, so a same-op move + delete is one commit).
  // A page-containing set is trashed by the caller via the chokepoint, which
  // takes the sub-pages' own locks and runs the lifecycle hooks itself.
  let trashedEntryId: string | null = null;
  if (!deferredToChokepoint && deletedRows.length > 0) {
    const roots = deleteRootIds.map((id) => beforeById.get(id)!);
    trashedEntryId = await trashDeletedRows(
      ctx,
      deletedRows,
      pageBlocksTrashEntry({
        pageId: roots[0]!.pageId,
        roots,
        count: deletedRows.length,
      }),
    );
  }

  return { deletedRows, deleteRootIds, deferredToChokepoint, trashedEntryId };
}

// ---------------------------------------------------------------------------
// Write shape 2 — the patch handler's field-scoped write
// ---------------------------------------------------------------------------

/**
 * A `BlockPatch` resolved against the LOCKED forest: which creates are fresh
 * inserts, which re-assert a live row, and which updates/deletes survived the
 * "an update never creates" rule.
 *
 * Resolution is the handler's policy — it owns the un-trash prelude (a create
 * whose id is TRASHED restores its whole ledger entry BEFORE this write, and
 * is then excluded from every bucket here), the page-type transition guard and
 * the notify heuristic. This is the write. There is deliberately no "un-trash"
 * bucket: clearing a row's flags without consuming its ledger entry would leave
 * an entry that points at nothing, which the ledger invariant forbids.
 */
export interface ResolvedBlockPatch {
  /** Rows that do not exist yet. */
  inserts: Block[];
  /** Full-row re-asserts onto rows that are already live (a replayed undo). */
  overwrites: Block[];
  /** Field-scoped updates; ids are guaranteed live. */
  updates: { id: string; changes: BlockFieldChanges }[];
  /** The LOCKED page forest (every live row), keyed by id. */
  stored: Map<string, BlockRow>;
  /**
   * The ids this patch removes. Ids not in `stored` are skipped (already gone);
   * the writer closes the set under descendants itself.
   */
  deleteIds: readonly string[];
}

/** Every column of a full row — what a create asserts. */
function fullRow(b: Block): BlockColumnChanges {
  return {
    pageId: b.pageId,
    parentId: b.parentId,
    type: b.type,
    data: parseBlockData(b.type, b.data),
    rank: b.rank.toJSON(),
    expanded: b.expanded,
    updatedAt: new Date(),
  };
}

/**
 * The patch handler's whole write: park the `(parent_id, rank)` pairs this batch
 * reassigns, then write the columns each entry NAMES.
 *
 * Field-scoped is the invariant, not an implementation detail. A writer that
 * owns one field cannot restate — and therefore cannot clobber — a field a
 * concurrent writer owns: the `data.text` projection says `data` and nothing
 * else, so it can no longer push a stale `type` over a conversion the user just
 * made. Only `creates` assert whole rows, because a create IS the full state.
 */
export async function writeBlockPatch(
  ctx: PageForestCtx,
  patch: ResolvedBlockPatch,
): Promise<ForestWriteResult> {
  const { inserts, overwrites, updates, stored } = patch;

  const deletedRows = deleteClosureOf(
    [...stored.values()],
    new Set(patch.deleteIds),
  );
  const deleteRootIds = deleteRootsOf(deletedRows);
  const deferredToChokepoint = deletedRows.some(
    (r) => r.type === PAGE_BLOCK_TYPE,
  );

  // Rows whose `(parentId, rank)` pair moves must be parked before the final
  // writes land — see `parkRanks`. This is a blind writer: undoing a swap hands
  // two rows each other's ranks, which the per-tuple `(parent_id, rank)` unique
  // index would reject mid-loop. A write that names NEITHER `parentId` nor
  // `rank` leaves the pair where it is, so it needs no park at all.
  const placements = [
    ...updates.map((u) => ({ id: u.id, changes: u.changes })),
    // A create asserts the whole row, so it always names both halves of the pair.
    ...overwrites.map((b) => ({
      id: b.id,
      changes: {
        parentId: b.parentId,
        rank: b.rank,
      } satisfies BlockFieldChanges,
    })),
  ].flatMap(({ id, changes }) => {
    const before = stored.get(id)!;
    const next = {
      parentId: namesField(changes, "parentId")
        ? changes.parentId!
        : before.parentId,
      rank: namesField(changes, "rank") ? changes.rank!.toJSON() : before.rank,
    };
    if (!pairChanged(before, next)) return [];
    return [{ id, currentParentId: before.parentId, ...next }];
  });
  const incoming = inserts.map((b) => ({
    parentId: b.parentId,
    rank: b.rank.toJSON(),
  }));

  // Parking runs first so the inserts below can take a pair a re-ranked row is
  // moving off. It only bumps `rank`, never `parent_id`, so it cannot depend on
  // a row `inserts` has not created yet.
  await parkRanks(ctx.tx, { placements, incoming });

  const now = new Date();
  await insertBlocks(
    ctx.tx,
    inserts.map((b) => ({
      id: b.id,
      pageId: b.pageId,
      parentId: b.parentId,
      type: b.type,
      data: parseBlockData(b.type, b.data),
      rank: b.rank.toJSON(),
      expanded: b.expanded,
      createdAt: now,
      updatedAt: now,
    })),
  );

  for (const b of overwrites) {
    await updateBlockFields(ctx.tx, b.id, fullRow(b));
  }

  for (const u of updates) {
    const before = stored.get(u.id)!;
    const changes = u.changes;
    // ONLY the named columns. `parseBlockData` validates against the EFFECTIVE
    // type, which is the point of the two-way split below:
    //  - `data` named → validate it against the type this write leaves the row
    //    at (the new one when `type` is also named, else the STORED one);
    //  - `type` named alone → the stored blob's validity is now judged by a
    //    different schema, so re-validate (and re-mint) it against the new type.
    //    A blob the target type rejects is a loud 400 here rather than an
    //    unreadable row later.
    const type = namesField(changes, "type") ? changes.type! : before.type;
    const set: BlockColumnChanges = { updatedAt: new Date() };
    if (namesField(changes, "parentId")) set.parentId = changes.parentId!;
    if (namesField(changes, "rank")) set.rank = changes.rank!.toJSON();
    if (namesField(changes, "expanded")) set.expanded = changes.expanded!;
    if (namesField(changes, "type")) set.type = changes.type!;
    if (namesField(changes, "data"))
      set.data = parseBlockData(type, changes.data);
    else if (namesField(changes, "type"))
      set.data = parseBlockData(type, before.data);
    await updateBlockFields(ctx.tx, u.id, set);
  }

  // Same delete branch as `writeForestTarget`: a page-free set is trashed
  // inline under one `page-blocks` entry; a page-containing set is the
  // caller's to route through the chokepoint after commit.
  let trashedEntryId: string | null = null;
  if (!deferredToChokepoint && deletedRows.length > 0) {
    const roots = deleteRootIds.map((id) => stored.get(id)!);
    trashedEntryId = await trashDeletedRows(
      ctx,
      deletedRows,
      pageBlocksTrashEntry({
        pageId: roots[0]!.pageId,
        roots,
        count: deletedRows.length,
      }),
    );
  }

  return { deletedRows, deleteRootIds, deferredToChokepoint, trashedEntryId };
}
