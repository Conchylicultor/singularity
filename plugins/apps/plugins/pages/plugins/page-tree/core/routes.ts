import { defineRoute } from "@plugins/primitives/plugins/pane/core";

export const pageDetailRoute = defineRoute({ id: "page-detail", segment: "page/:pageId" });

export const pagesTreeRoute = defineRoute({ id: "pages-tree", segment: "pages-tree" });
