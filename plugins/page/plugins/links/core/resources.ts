import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { BacklinkRowSchema, PageLinkEdgeSchema } from "./schemas";
import type { PageLinkEdge } from "./schemas";

// The pages that link TO `pageId`, ordered by title — one value per target
// page, pushed whole whenever any table its loader read changes (the change
// feed; no explicit notify). A value rather than a collection: its rows are a
// join (`page_links` ⨝ the live `page` blocks, projecting the source page's
// title and icon out of its `data` JSON), not the rows of one table, and the
// edge table's key is the composite (source, target) pair.
export const pageBacklinks = liveValue("page-backlinks", {
  schema: z.array(BacklinkRowSchema),
  params: ["pageId"],
});

// Unparameterized: every (source → target) link edge in the index. The pages
// sidebar consumes this to render linked pages as reference children of each
// linking page.
export const pageLinksResource = resourceDescriptor<PageLinkEdge[]>(
  "page-links",
  z.array(PageLinkEdgeSchema),
  [],
);
