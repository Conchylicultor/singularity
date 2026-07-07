import { z } from "zod";
import { BlockSchema, type Block } from "./schemas";

// ---------------------------------------------------------------------------
// Block patch: the minimal-change wire format used by undo/redo (and any future
// generic "apply these exact row changes" path). A patch re-applies onto the
// CURRENT document state (never a full-document snapshot): it upserts the given
// full block rows (insert-or-update by id) and deletes the given ids. This is
// what makes undo/redo entanglement-safe — a patch only touches the rows the
// action it inverts touched, so undoing an old action never clobbers unrelated
// later edits.
// ---------------------------------------------------------------------------

/**
 * A minimal forward/reverse change set over block rows. `upserts` carry the FULL
 * persisted row (so the server can blindly insert-or-update them); `deleteIds`
 * are removed (subtree cascade handled server-side like the normal delete path).
 */
export interface BlockPatch {
  upserts: Block[];
  deleteIds: string[];
  /**
   * When true the patch never CREATES rows: an upsert whose id no longer
   * exists is skipped, on both the client overlay and the server writer.
   * Used by the CRDT-mode text projection (Stage 4a): a debounced projection
   * flush racing a concurrent delete — most importantly a history RESTORE,
   * which replaces every content row — must never resurrect a deleted block
   * with its pre-delete text. Undo/redo patches deliberately do NOT set this:
   * undoing a delete requires re-creating rows.
   */
  updateOnly?: boolean;
}

export const BlockPatchSchema = z.object({
  upserts: z.array(BlockSchema),
  deleteIds: z.array(z.string()),
  updateOnly: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Diff: compare two full-row snapshots by id into inserted / updated / deleted.
// Pure (React/DB-free) so BOTH the client recorder (to build undo/redo patches)
// and any server consumer can use it without crossing the web/server boundary.
// Operates on the full `Block` row (rank as a `Rank` instance, with timestamps)
// — the shape the client recorder already holds in `rowsRef`.
// ---------------------------------------------------------------------------

/**
 * Stable deep-equal over JSON-serializable values (key-order-independent for
 * objects, positional for arrays). Mirrors the server reconcile's comparator so
 * client and server agree on what counts as a `data` change.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).sort();
  const bKeys = Object.keys(bo).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqual(ao[aKeys[i]!], bo[bKeys[i]!])) return false;
  }
  return true;
}

/** Has a persisted structural column changed between two rows of the same id? */
function rowChanged(before: Block, after: Block): boolean {
  return (
    before.parentId !== after.parentId ||
    String(before.rank) !== String(after.rank) ||
    before.expanded !== after.expanded ||
    before.type !== after.type ||
    !deepEqual(before.data, after.data)
  );
}

export interface BlockDiff {
  /** Rows present in `after` but not in `before`. */
  inserted: Block[];
  /** Rows present in both whose persisted columns changed (carry both sides). */
  updated: { before: Block; after: Block }[];
  /** Ids present in `before` but absent from `after`. */
  deletedIds: string[];
  /** Rows present in `before` but absent from `after` (the deleted rows). */
  deleted: Block[];
}

/**
 * Diff two full-row block snapshots by id. Pure. Used by the undo/redo recorder
 * to derive minimal forward + reverse {@link BlockPatch}es from a before/after
 * pair the action produced.
 */
export function diffBlocks(before: Block[], after: Block[]): BlockDiff {
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterById = new Map(after.map((b) => [b.id, b]));

  const inserted: Block[] = [];
  const updated: { before: Block; after: Block }[] = [];
  for (const row of after) {
    const prev = beforeById.get(row.id);
    if (!prev) {
      inserted.push(row);
      continue;
    }
    if (rowChanged(prev, row)) updated.push({ before: prev, after: row });
  }

  const deletedIds: string[] = [];
  const deleted: Block[] = [];
  for (const row of before) {
    if (!afterById.has(row.id)) {
      deletedIds.push(row.id);
      deleted.push(row);
    }
  }

  return { inserted, updated, deletedIds, deleted };
}

/**
 * Build the forward + reverse patches that re-apply / invert a `diff`.
 *
 * - **redo** re-applies the change: upsert everything that was inserted or
 *   updated to its *after* row, delete everything that was deleted.
 * - **undo** inverts it: upsert everything that was updated back to its *before*
 *   row and re-create every deleted row (its *before* state), delete everything
 *   that was inserted.
 */
export function patchesFromDiff(diff: BlockDiff): { redo: BlockPatch; undo: BlockPatch } {
  return {
    redo: {
      upserts: [...diff.inserted, ...diff.updated.map((u) => u.after)],
      deleteIds: diff.deletedIds,
    },
    undo: {
      upserts: [...diff.updated.map((u) => u.before), ...diff.deleted],
      deleteIds: diff.inserted.map((b) => b.id),
    },
  };
}

/** True when a patch would change nothing (lets the recorder skip empty diffs). */
export function isEmptyPatch(patch: BlockPatch): boolean {
  return patch.upserts.length === 0 && patch.deleteIds.length === 0;
}
