import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { defineTrashSource } from "@plugins/infra/plugins/trash/server";
import { handleListPages } from "./internal/handle-list-pages";
import { handleListBlocks } from "./internal/handle-list-blocks";
import { handleGetBlockPage } from "./internal/handle-get-block-page";
import { handleCreateBlock } from "./internal/handle-create-block";
import { handleUpdateBlock } from "./internal/handle-update-block";
import { handleDeleteBlock } from "./internal/handle-delete-block";
import { handleMoveBlock } from "./internal/handle-move-block";
import { handleTurnIntoPage } from "./internal/handle-turn-into-page";
import { handleApplyBlockOp } from "./internal/handle-apply-block-op";
import { handlePatchBlocks } from "./internal/handle-patch-blocks";
import { pagesLiveResource, blocksLiveResource } from "./internal/resources";
import {
  restoreTrashedBlocks,
  purgeTrashedBlocks,
} from "./internal/trash-blocks";
import { blocksChanged } from "./internal/tables-events";
import { Editor } from "./internal/block-registry";
import {
  pageBlockHandle,
  PAGES_TRASH_SOURCE,
  PAGE_BLOCKS_TRASH_SOURCE,
} from "../core/schemas";
import {
  listPages,
  listBlocks,
  getBlockPage,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  turnIntoPage,
  applyBlockOpEndpoint,
  patchBlocks,
} from "../core/endpoints";

export { _blocks } from "./internal/tables";
// The LIVE relation every reader takes (`page_blocks WHERE deleted_at IS NULL`,
// the predicate never spelled). `_blocks` itself is for the trash machinery —
// `page-editor/no-unfiltered-blocks-read` flags any other read of it.
export { liveBlocks } from "./internal/live-blocks";
export { pagesLiveResource, blocksLiveResource } from "./internal/resources";
export { blocksChanged } from "./internal/tables-events";
export type { BlocksChangedPayload } from "./internal/tables-events";
export { BlockLifecycle } from "./internal/document-hooks";
export type {
  AfterCommit,
  BlockCreateHook,
  BlockDeleteHook,
  BlockRestoreHook,
  BlockTrashHook,
  DeletedBlockRow,
} from "./internal/document-hooks";
export type { PageForestTx } from "./internal/page-forest";
// The delete chokepoint and its inverse: every block delete is a trash, and a
// consumer that trashed through the chokepoint restores through this.
export { deleteBlocksSubtree, untrashBlocks } from "./internal/trash-blocks";
export {
  BlockSchema,
  PageDataSchema,
  PAGE_BLOCK_TYPE,
  pageData,
} from "../core/schemas";
export type { Block, PageData } from "../core/schemas";
// History restore's read and write. The write keeps block identity and edits
// text through a writer the caller hands in (`page/block-text-write`).
export {
  serializePageContent,
  restorePageContent,
} from "./internal/page-content";
// The one sanctioned forest write for a caller holding a computed `BlockPatch`
// (`page-editor/no-adhoc-forest-write` forbids every other route into `_blocks`).
export { applyPageBlockPatch } from "./internal/handle-patch-blocks";
export type {
  BlockTextWriter,
  PageContentSnapshot,
  StoredBlock,
} from "./internal/page-content";
export {
  Editor,
  blockTextProtectedSpans,
  blockTextServerExtensions,
  blockTextServerNodes,
  resolveBlockAnnotations,
} from "./internal/block-registry";

export default {
  description: "Block-based document editor — tables, routes, and live state.",
  httpRoutes: {
    [listPages.route]: handleListPages,
    [listBlocks.route]: handleListBlocks,
    [getBlockPage.route]: handleGetBlockPage,
    [createBlock.route]: handleCreateBlock,
    [updateBlock.route]: handleUpdateBlock,
    [deleteBlock.route]: handleDeleteBlock,
    [moveBlock.route]: handleMoveBlock,
    [turnIntoPage.route]: handleTurnIntoPage,
    [applyBlockOpEndpoint.route]: handleApplyBlockOp,
    [patchBlocks.route]: handlePatchBlocks,
  },
  register: [
    blocksChanged,
    // Two trash sources over ONE ledger mechanism — every block delete is a
    // trash. `pages` holds the entries page roots mint (what the Pages Trash
    // dialog lists); `page-blocks` holds the anchor entry a page-free delete
    // mints for its content rows (undo + purge only, no UI). Both restore by
    // clearing the rows' flags and consuming the entry (restoreTrashedBlocks →
    // untrashBlocks), and are hard-deleted only at purge (purgeTrashedBlocks
    // runs the OnDelete hooks + cascades).
    defineTrashSource({
      id: PAGES_TRASH_SOURCE,
      restore: restoreTrashedBlocks,
      purge: purgeTrashedBlocks,
    }),
    defineTrashSource({
      id: PAGE_BLOCKS_TRASH_SOURCE,
      restore: restoreTrashedBlocks,
      purge: purgeTrashedBlocks,
    }),
  ],
  contributions: [
    Resource.Declare(pagesLiveResource),
    Resource.Declare(blocksLiveResource),
    // `page` is owned here, not by the `sub-page` renderer: page rows are written
    // directly by turn-into-page / restorePageContent, so their validation must not
    // depend on the sub-page plugin being enabled. sub-page contributes only its web
    // renderer — a second `Editor.BlockData("page")` would be a duplicate → throw.
    Editor.BlockData(pageBlockHandle),
  ],
} satisfies ServerPluginDefinition;
