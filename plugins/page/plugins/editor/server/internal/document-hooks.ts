import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

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

// Runs synchronously inside the block delete handler, BEFORE the row and its
// FK-cascade descendant subtree are removed. `blockIds` is the full set the
// delete will wipe (root + descendants, via collectBlockSubtree). A hook may
// return an after-delete callback, invoked once the delete commits, for
// notifications that must reflect post-delete state (e.g. backlinks panels).
// Collection-consumer separation: the handler dispatches generically and never
// names a contributor.
export interface BlockDeleteHook {
  beforeDelete: (
    blockIds: string[],
  ) =>
    | Promise<(() => void | Promise<void>) | void>
    | (() => void | Promise<void>)
    | void;
}

// A subtree was soft-deleted (trashed): the rows still exist with `deleted_at`
// set, so FK cascades did NOT fire — a hook must therefore actively drop any
// derived state that a hard-delete cascade would have reclaimed (search docs,
// backlink edges). `blockIds` is the full trashed set (root + descendants).
export interface BlockTrashHook {
  onTrash: (blockIds: string[]) => Promise<void> | void;
}

// A trashed subtree was restored: its rows are live again. A hook rebuilds the
// derived state it dropped in `onTrash` (reindex search, re-extract links).
export interface BlockRestoreHook {
  onRestore: (blockIds: string[]) => Promise<void> | void;
}

export const BlockLifecycle = {
  AfterCreate: defineServerContribution<BlockCreateHook>(
    "page.editor.block.afterCreate",
  ),
  // Fires on HARD delete and PURGE only (the row + its cascade subtree really
  // vanish). Version history stays bound here — deleted only at purge — which is
  // the core of the trash fix: trashing a page no longer destroys its versions.
  BeforeDelete: defineServerContribution<BlockDeleteHook>(
    "page.editor.block.beforeDelete",
  ),
  OnTrash: defineServerContribution<BlockTrashHook>("page.editor.block.onTrash"),
  OnRestore: defineServerContribution<BlockRestoreHook>(
    "page.editor.block.onRestore",
  ),
};
