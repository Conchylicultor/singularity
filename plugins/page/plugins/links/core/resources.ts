import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { BacklinkRowSchema, PageLinkEdgeSchema } from "./schemas";
import type { BacklinkRow, PageLinkEdge } from "./schemas";

// Parameterized by the target page id. Lists the pages that link TO `pageId`.
export const backlinksResource = resourceDescriptor<BacklinkRow[], { pageId: string }>(
  "page-backlinks",
  z.array(BacklinkRowSchema),
  [],
);

// Unparameterized: every (source → target) link edge in the index. The pages
// sidebar consumes this to render linked pages as reference children of each
// linking page.
export const pageLinksResource = resourceDescriptor<PageLinkEdge[]>(
  "page-links",
  z.array(PageLinkEdgeSchema),
  [],
);
