import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleListPages } from "./internal/handle-list-pages";
import { handleListBlocks } from "./internal/handle-list-blocks";
import { handleCreateBlock } from "./internal/handle-create-block";
import { handleUpdateBlock } from "./internal/handle-update-block";
import { handleDeleteBlock } from "./internal/handle-delete-block";
import { handleMoveBlock } from "./internal/handle-move-block";
import { handleTurnIntoPage } from "./internal/handle-turn-into-page";
import { handleApplyBlockOp } from "./internal/handle-apply-block-op";
import { handlePatchBlocks } from "./internal/handle-patch-blocks";
import { handleBulkDeleteBlock } from "./internal/handle-bulk-delete-block";
import { handleBulkMoveBlock } from "./internal/handle-bulk-move-block";
import { handleBulkDuplicateBlock } from "./internal/handle-bulk-duplicate-block";
import { handlePasteBlock } from "./internal/handle-paste-block";
import { pagesLiveResource, blocksLiveResource } from "./internal/resources";
import { blocksChanged } from "./internal/tables-events";
import { Editor } from "./internal/block-registry";
import { pageBlockHandle } from "../core/schemas";
import {
  listPages,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  turnIntoPage,
  applyBlockOpEndpoint,
  patchBlocks,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
} from "../core/endpoints";

export { _blocks } from "./internal/tables";
export { pagesLiveResource, blocksLiveResource } from "./internal/resources";
export { blocksChanged } from "./internal/tables-events";
export type { BlocksChangedPayload } from "./internal/tables-events";
export { BlockLifecycle } from "./internal/document-hooks";
export type { BlockDeleteHook } from "./internal/document-hooks";
export { BlockSchema, PageDataSchema, PAGE_BLOCK_TYPE, pageData } from "../core/schemas";
export type { Block, PageData } from "../core/schemas";
export { serializePageContent, replacePageContent } from "./internal/page-content";
export type { PageContentSnapshot, StoredBlock } from "./internal/page-content";
export { Editor } from "./internal/block-registry";

export default {
  description: "Block-based document editor — tables, routes, and live state.",
  httpRoutes: {
    [listPages.route]: handleListPages,
    [listBlocks.route]: handleListBlocks,
    [createBlock.route]: handleCreateBlock,
    [updateBlock.route]: handleUpdateBlock,
    [deleteBlock.route]: handleDeleteBlock,
    [moveBlock.route]: handleMoveBlock,
    [turnIntoPage.route]: handleTurnIntoPage,
    [applyBlockOpEndpoint.route]: handleApplyBlockOp,
    [patchBlocks.route]: handlePatchBlocks,
    [bulkDeleteBlocks.route]: handleBulkDeleteBlock,
    [bulkMoveBlocks.route]: handleBulkMoveBlock,
    [bulkDuplicateBlocks.route]: handleBulkDuplicateBlock,
    [pasteBlocks.route]: handlePasteBlock,
  },
  register: [blocksChanged],
  contributions: [
    Resource.Declare(pagesLiveResource),
    Resource.Declare(blocksLiveResource),
    // `page` is owned here, not by the `sub-page` renderer: page rows are written
    // directly by turn-into-page / replacePageContent, so their validation must not
    // depend on the sub-page plugin being enabled. sub-page contributes only its web
    // renderer — a second `Editor.BlockData("page")` would be a duplicate → throw.
    Editor.BlockData(pageBlockHandle),
  ],
} satisfies ServerPluginDefinition;
