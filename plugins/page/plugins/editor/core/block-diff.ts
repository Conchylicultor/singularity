import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { BlockSchema, type Block } from "./schemas";

// ---------------------------------------------------------------------------
// Block patch: the minimal-change wire format used by undo/redo (and any future
// generic "apply these exact row changes" path). A patch re-applies onto the
// CURRENT document state (never a full-document snapshot), so undo/redo is
// entanglement-safe — a patch only touches the rows the action it inverts
// touched, and only the FIELDS that action changed.
//
// The create/update split is the load-bearing part. A create carries a full
// row because a new row has no prior state to preserve; an update names ONLY
// the fields it changes, so a writer that means to change one field is
// structurally incapable of restating (and therefore clobbering) a field a
// concurrent writer owns. The incident that forced it: the `doc → data.text`
// projection flushing on unmount during a conversion restated `type: "text"`
// over the callout the user had just picked, because the patch carried a whole
// `Block`.
// ---------------------------------------------------------------------------

/**
 * The persisted columns a row-level update may change. `pageId` is deliberately
 * absent: a row's owning page is re-scoped only by dedicated endpoints
 * (`turn-into-page`, move), never by a blind patch.
 */
export type BlockFieldChanges = Partial<
  Pick<Block, "parentId" | "type" | "data" | "rank" | "expanded">
>;

/** One row's field-scoped change set. `changes` is never empty by construction. */
export interface BlockUpdate {
  id: string;
  changes: BlockFieldChanges;
}

/**
 * A minimal forward/reverse change set over block rows.
 *
 * - `creates` carry the FULL row (a new row has no prior state). On the server
 *   a create whose id matches a soft-deleted row un-trashes it instead.
 * - `updates` name only the changed fields. An update naming an id that no
 *   longer exists is a **skip by definition** — on the client overlay and on
 *   the server writer alike. That is what makes the debounced `data.text`
 *   projection safe against a racing delete (a history restore, another tab):
 *   it can never resurrect a row it only meant to update.
 * - `deleteIds` are removed (subtree cascade handled server-side like the
 *   normal delete path).
 */
export interface BlockPatch {
  creates: Block[];
  updates: BlockUpdate[];
  deleteIds: string[];
}

/**
 * Wire schema for a field-scoped change set. Every key is optional, and a key's
 * PRESENCE — not its value — is what "this patch writes that column" means (see
 * {@link namesField}). `data` uses bare `z.unknown()`, which zod already treats
 * as optional and, crucially, leaves absent in the output when absent from the
 * input — so an update that says nothing about `data` stays that way.
 */
export const BlockFieldChangesSchema = z.object({
  parentId: z.string().nullable().optional(),
  type: z.string().optional(),
  data: z.unknown(),
  rank: RankSchema.optional(),
  expanded: z.boolean().optional(),
});

export const BlockPatchSchema = z.object({
  creates: z.array(BlockSchema),
  updates: z.array(z.object({ id: z.string(), changes: BlockFieldChangesSchema })),
  deleteIds: z.array(z.string()),
});

/**
 * Does `changes` NAME `field` — i.e. does this patch claim authority over that
 * column? Presence, not truthiness: `parentId: null` and `expanded: false` are
 * real writes, and `data` may legitimately be any value. The single predicate
 * every consumer (overlay merge, reflection check, server writer) reads, so
 * client and server can never disagree about what a patch asserts.
 */
export function namesField(
  changes: BlockFieldChanges,
  field: keyof BlockFieldChanges,
): boolean {
  return Object.prototype.hasOwnProperty.call(changes, field);
}

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

/**
 * Do two `data` blobs count as equal? THE comparator for the `data` column,
 * shared by the diff (which decides whether to emit a change) and the overlay's
 * reflection check (which decides whether that change has landed) — so a patch
 * can never be produced by one definition and judged by another.
 */
export function dataEqual(a: unknown, b: unknown): boolean {
  return deepEqual(a, b);
}

/**
 * The persisted columns that differ between two rows of the same id, as the
 * change set that turns `before` into `after`. Empty ⇒ the row is unchanged.
 * THE definition of "what this write claims" — every producer derives its patch
 * from here rather than restating a row.
 */
export function changedFields(before: Block, after: Block): BlockFieldChanges {
  const changes: BlockFieldChanges = {};
  if (before.parentId !== after.parentId) changes.parentId = after.parentId;
  if (before.type !== after.type) changes.type = after.type;
  // `rank` is a `Rank` instance: compare by stored value, not identity.
  if (String(before.rank) !== String(after.rank)) changes.rank = after.rank;
  if (before.expanded !== after.expanded) changes.expanded = after.expanded;
  if (!deepEqual(before.data, after.data)) changes.data = after.data;
  return changes;
}

/**
 * The values `row` holds for exactly the fields `named` claims — the inverse of
 * a change set. `patchesFromDiff` builds the undo update with it, so undo
 * restores precisely the fields redo wrote and says nothing about the rest.
 */
function fieldsOf(row: Block, named: BlockFieldChanges): BlockFieldChanges {
  const changes: BlockFieldChanges = {};
  if (namesField(named, "parentId")) changes.parentId = row.parentId;
  if (namesField(named, "type")) changes.type = row.type;
  if (namesField(named, "rank")) changes.rank = row.rank;
  if (namesField(named, "expanded")) changes.expanded = row.expanded;
  if (namesField(named, "data")) changes.data = row.data;
  return changes;
}

export interface BlockDiff {
  /** Rows present in `after` but not in `before`. */
  inserted: Block[];
  /**
   * Rows present in both whose persisted columns changed. Carries both sides
   * plus the derived `changes` (never empty), so the forward and reverse
   * patches name the same field set.
   */
  updated: { before: Block; after: Block; changes: BlockFieldChanges }[];
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
  const updated: BlockDiff["updated"] = [];
  for (const row of after) {
    const prev = beforeById.get(row.id);
    if (!prev) {
      inserted.push(row);
      continue;
    }
    const changes = changedFields(prev, row);
    if (Object.keys(changes).length > 0) updated.push({ before: prev, after: row, changes });
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
 * - **redo** re-applies the change: create everything that was inserted, write
 *   each updated row's changed fields to their *after* values, delete
 *   everything that was deleted.
 * - **undo** inverts it: re-create every deleted row (its *before* state as a
 *   full row — the row is gone, so there is nothing to merge onto), restore
 *   exactly the fields redo wrote to their *before* values, and delete
 *   everything that was inserted.
 */
export function patchesFromDiff(diff: BlockDiff): { redo: BlockPatch; undo: BlockPatch } {
  return {
    redo: {
      creates: diff.inserted,
      updates: diff.updated.map((u) => ({ id: u.after.id, changes: u.changes })),
      deleteIds: diff.deletedIds,
    },
    undo: {
      creates: diff.deleted,
      updates: diff.updated.map((u) => ({
        id: u.before.id,
        changes: fieldsOf(u.before, u.changes),
      })),
      deleteIds: diff.inserted.map((b) => b.id),
    },
  };
}

/** True when a patch would change nothing (lets the recorder skip empty diffs). */
export function isEmptyPatch(patch: BlockPatch): boolean {
  return (
    patch.creates.length === 0 && patch.updates.length === 0 && patch.deleteIds.length === 0
  );
}
