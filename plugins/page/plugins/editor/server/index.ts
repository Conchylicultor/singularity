import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleListPages } from "./internal/handle-list-pages";
import { handleListBlocks } from "./internal/handle-list-blocks";
import { handleCreateBlock } from "./internal/handle-create-block";
import { handleUpdateBlock } from "./internal/handle-update-block";
import { handleDeleteBlock } from "./internal/handle-delete-block";
import { handleMoveBlock } from "./internal/handle-move-block";
import { handleSplitBlock } from "./internal/handle-split-block";
import { handleMergeBlocks } from "./internal/handle-merge-blocks";
import { handleIndentBlock } from "./internal/handle-indent-block";
import { handleOutdentBlock } from "./internal/handle-outdent-block";
import { handleBulkDeleteBlock } from "./internal/handle-bulk-delete-block";
import { handleBulkMoveBlock } from "./internal/handle-bulk-move-block";
import { handleBulkDuplicateBlock } from "./internal/handle-bulk-duplicate-block";
import { handlePasteBlock } from "./internal/handle-paste-block";
import { pagesLiveResource, blocksLiveResource } from "./internal/resources";
import { blocksChanged } from "./internal/tables-events";
import {
  listPages,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  splitBlock,
  mergeBlocks,
  indentBlock,
  outdentBlock,
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

export default {
  description: "Block-based document editor — tables, routes, and live state.",
  httpRoutes: {
    [listPages.route]: handleListPages,
    [listBlocks.route]: handleListBlocks,
    [createBlock.route]: handleCreateBlock,
    [updateBlock.route]: handleUpdateBlock,
    [deleteBlock.route]: handleDeleteBlock,
    [moveBlock.route]: handleMoveBlock,
    [splitBlock.route]: handleSplitBlock,
    [mergeBlocks.route]: handleMergeBlocks,
    [indentBlock.route]: handleIndentBlock,
    [outdentBlock.route]: handleOutdentBlock,
    [bulkDeleteBlocks.route]: handleBulkDeleteBlock,
    [bulkMoveBlocks.route]: handleBulkMoveBlock,
    [bulkDuplicateBlocks.route]: handleBulkDuplicateBlock,
    [pasteBlocks.route]: handlePasteBlock,
  },
  register: [blocksChanged],
  contributions: [
    Resource.Declare(pagesLiveResource),
    Resource.Declare(blocksLiveResource),
  ],
} satisfies ServerPluginDefinition;
