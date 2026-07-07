import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { blockContentServerResource } from "./internal/resource";
import { handleBlockDocInit, handleBlockDocUpdate } from "./internal/routes";
import { blockDocInit, blockDocUpdate } from "../core";

export { _pageBlockDocs } from "./internal/tables";
export { blockContentServerResource } from "./internal/resource";

export default {
  description:
    "Per-block content-CRDT server (content-agnostic): the page_block_docs state store, the per-block keyed live resource, the first-writer-wins doc-init seed, and the doc-update Yjs merge endpoint.",
  contributions: [Resource.Declare(blockContentServerResource)],
  httpRoutes: {
    [blockDocInit.route]: handleBlockDocInit,
    [blockDocUpdate.route]: handleBlockDocUpdate,
  },
} satisfies ServerPluginDefinition;
