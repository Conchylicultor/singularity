import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleListDocuments } from "./internal/handle-list-documents";
import { handleCreateDocument } from "./internal/handle-create-document";
import { handleGetDocument } from "./internal/handle-get-document";
import { handleUpdateDocument } from "./internal/handle-update-document";
import { handleDeleteDocument } from "./internal/handle-delete-document";
import { handleListBlocks } from "./internal/handle-list-blocks";
import { handleCreateBlock } from "./internal/handle-create-block";
import { handleUpdateBlock } from "./internal/handle-update-block";
import { handleDeleteBlock } from "./internal/handle-delete-block";
import { handleMoveBlock } from "./internal/handle-move-block";
import { handleSplitBlock } from "./internal/handle-split-block";
import { handleMergeBlocks } from "./internal/handle-merge-blocks";
import { handleIndentBlock } from "./internal/handle-indent-block";
import { handleOutdentBlock } from "./internal/handle-outdent-block";
import { documentsLiveResource, blocksLiveResource } from "./internal/resources";
import { blocksChanged } from "./internal/tables-events";
import {
  listDocuments,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  splitBlock,
  mergeBlocks,
  indentBlock,
  outdentBlock,
} from "../core/endpoints";

export { _documents, _blocks } from "./internal/tables";
export { documentsLiveResource, blocksLiveResource } from "./internal/resources";
export { blocksChanged } from "./internal/tables-events";
export type { BlocksChangedPayload } from "./internal/tables-events";
export { DocumentSchema, BlockSchema } from "../core/schemas";
export type { Document, Block } from "../core/schemas";

export default {
  name: "Page Editor",
  description: "Block-based document editor — tables, routes, and live state.",
  httpRoutes: {
    [listDocuments.route]: handleListDocuments,
    [createDocument.route]: handleCreateDocument,
    [getDocument.route]: handleGetDocument,
    [updateDocument.route]: handleUpdateDocument,
    [deleteDocument.route]: handleDeleteDocument,
    [listBlocks.route]: handleListBlocks,
    [createBlock.route]: handleCreateBlock,
    [updateBlock.route]: handleUpdateBlock,
    [deleteBlock.route]: handleDeleteBlock,
    [moveBlock.route]: handleMoveBlock,
    [splitBlock.route]: handleSplitBlock,
    [mergeBlocks.route]: handleMergeBlocks,
    [indentBlock.route]: handleIndentBlock,
    [outdentBlock.route]: handleOutdentBlock,
  },
  register: [blocksChanged],
  contributions: [
    Resource.Declare(documentsLiveResource),
    Resource.Declare(blocksLiveResource),
  ],
} satisfies ServerPluginDefinition;
