import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

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

export const BlockLifecycle = {
  BeforeDelete: defineServerContribution<BlockDeleteHook>(
    "page.editor.block.beforeDelete",
  ),
};
