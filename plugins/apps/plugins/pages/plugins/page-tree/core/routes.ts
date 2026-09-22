import { defineRoute } from "@plugins/primitives/plugins/pane/core";

export const pageDetailRoute = defineRoute({
  id: "page-detail",
  segment: "page/:pageId",
});

// One block of a page, opened as a page of its own (the editor's `rootId` zoom).
export const blockDetailRoute = defineRoute({
  id: "block-detail",
  segment: "block/:blockId",
});

export const pagesTreeRoute = defineRoute({
  id: "pages-tree",
  segment: "pages-tree",
});
