import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { PageForestTx } from "./page-forest";

/** Work a hook defers until the write commits — re-push, deindex, re-derive. */
export type AfterCommit = () => void | Promise<void>;

// A block row was just inserted (row committed, `blocksChanged` already fanned
// out) and the handler has not yet answered. `block` carries the FINAL resolved
// shape — the `parentId` the insert actually used and the denormalized `pageId`
// — not the raw request body. `req` is the request that caused the create, so a
// contributor can classify the write's PROVENANCE (who/what asked for it) from
// headers; the handler itself stays agnostic and never inspects it.
// Collection-consumer separation: the handler dispatches generically and never
// names a contributor.
export interface BlockCreateHook {
  afterCreate: (
    block: {
      id: string;
      type: string;
      parentId: string | null;
      pageId: string | null;
    },
    req: Request,
  ) => Promise<void> | void;
}

/**
 * A row a delete removes from a page's LIVE content — trashed (every delete a
 * user or a history restore makes) or hard-deleted (purge) — as the writer
 * reconciled it. `type` is the fact every contributor actually wants ("which of
 * these were page rows"), so it is answered in memory rather than by a DB
 * round-trip per hook. The same shape is handed back on restore.
 */
export interface DeletedBlockRow {
  id: string;
  type: string;
  pageId: string | null;
  parentId: string | null;
}

// Runs inside the LOCKED write transaction, on exactly the branch that really
// hard-deletes, immediately before the rows and their FK-cascade descendant
// subtree are removed. A hook may return an after-commit callback for work that
// must reflect post-delete state and must not hold the page lock (e.g. dropping
// search docs, version history, backlinks panels).
//
// Collection-consumer separation: the writer dispatches generically and never
// names a contributor.
export interface BlockDeleteHook {
  onDelete: (
    /**
     * The full set the delete will wipe (roots + cascade descendants).
     * AUTHORITATIVE — reconciled under the page lock, never predicted from an
     * unlocked read, so the hooks and the transaction can no longer disagree
     * about what vanished.
     */
    rows: readonly DeletedBlockRow[],
    /**
     * Read anything the cascade is about to destroy ON THE TRANSACTION, never
     * the pool. This parameter is what lets a hook that genuinely needs
     * pre-delete state from another table stay inside the write — satisfying
     * `database/no-pool-await-in-transaction` by construction, instead of the
     * old "run it outside the transaction and accept a stale set".
     */
    tx: PageForestTx,
  ) => Promise<AfterCommit | void> | AfterCommit | void;
}

// A set of rows was soft-deleted (trashed) — which is what EVERY user delete
// is: the rows still exist with `deleted_at` set, so FK cascades did NOT fire —
// a hook must therefore actively drop any derived state that a hard-delete
// cascade would have reclaimed (search docs, backlink edges). `rows` is the full
// trashed set (roots + descendants), handed as ROWS for the same reason
// `onDelete` is: "which of these were page rows" is answered by `row.type` in
// memory, never by a DB read per hook. Runs AFTER the trashing transaction
// commits (never under the page lock).
export interface BlockTrashHook {
  onTrash: (rows: readonly DeletedBlockRow[]) => Promise<void> | void;
}

// A trashed set was restored: its rows are live again (a root may have been
// re-ranked or reparented — `parentId`/`pageId` are the RESTORED values). A hook
// rebuilds the derived state it dropped in `onTrash` (reindex search,
// re-extract links). Runs after the restoring transaction commits.
export interface BlockRestoreHook {
  onRestore: (rows: readonly DeletedBlockRow[]) => Promise<void> | void;
}

export const BlockLifecycle = {
  AfterCreate: defineServerContribution<BlockCreateHook>(
    "page.editor.block.afterCreate",
  ),
  // Fires on PURGE only — the one path that really hard-deletes (the row + its
  // cascade subtree vanish). A user delete and a history restore always trash,
  // and never reach this. Version history stays
  // bound here — deleted only at purge — which is the core of the trash fix:
  // trashing a page no longer destroys its versions.
  OnDelete: defineServerContribution<BlockDeleteHook>(
    "page.editor.block.onDelete",
  ),
  OnTrash: defineServerContribution<BlockTrashHook>(
    "page.editor.block.onTrash",
  ),
  OnRestore: defineServerContribution<BlockRestoreHook>(
    "page.editor.block.onRestore",
  ),
};
