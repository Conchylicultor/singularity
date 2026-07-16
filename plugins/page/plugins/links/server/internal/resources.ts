import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { BacklinkRowSchema, PageLinkEdgeSchema } from "../../core/schemas";
import {
  backlinksResource as backlinksDescriptor,
  pageLinksResource as pageLinksDescriptor,
} from "../../core/resources";
import type { BacklinkRow, PageLinkEdge } from "../../core/schemas";
import { _pageLinks } from "./tables";

// `data->>'title'` / `data->'iconSvgNodes'`: the source page's title and icon
// SVG tree live in the `type="page"` block's `data` JSON. `->` (not `->>`)
// keeps the icon tree as JSON so it deserializes back to an array.
const titleExpr = sql<string>`${_blocks.data} ->> 'title'`;
const iconSvgNodesExpr = sql<unknown>`${_blocks.data} -> 'iconSvgNodes'`;

// Push resource: lists the source pages that link TO `pageId`, ordered by
// title. Notified by the reindexer for every affected target.
export const backlinksResource = defineResource<BacklinkRow[], { pageId: string }>({
  key: backlinksDescriptor.key,
  mode: "push",
  schema: z.array(BacklinkRowSchema),
  loader: async ({ pageId }) =>
    db
      .select({
        id: _blocks.id,
        title: titleExpr,
        iconSvgNodes: iconSvgNodesExpr,
      })
      .from(_pageLinks)
      .innerJoin(_blocks, eq(_pageLinks.sourcePageId, _blocks.id))
      .where(eq(_pageLinks.targetPageId, pageId))
      .orderBy(asc(titleExpr)) as unknown as Promise<BacklinkRow[]>,
});

// Push resource: the full (source → target) edge list. Every write to
// `page_links` — reindex insert/delete, the trash hook's edge drop, an FK
// cascade from a hard delete — is picked up by the L4 DB change-feed, so the
// sidebar's linked-page reference children stay live with no explicit pushes.
export const pageLinksLiveResource = defineResource<PageLinkEdge[]>({
  key: pageLinksDescriptor.key,
  mode: "push",
  schema: z.array(PageLinkEdgeSchema),
  loader: async () =>
    db
      .select({
        sourcePageId: _pageLinks.sourcePageId,
        targetPageId: _pageLinks.targetPageId,
      })
      .from(_pageLinks)
      .orderBy(asc(_pageLinks.sourcePageId), asc(_pageLinks.targetPageId)),
});
