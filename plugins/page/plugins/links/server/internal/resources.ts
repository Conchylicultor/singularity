import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import {
  nullable,
  parsed,
} from "@plugins/database/plugins/sql-projection/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { serveValue } from "@plugins/network/plugins/live/server";
import { EmojiSchema } from "@plugins/ui/plugins/icons/plugins/emoji/core";
import { liveBlocks } from "@plugins/page/plugins/editor/server";
import { PageLinkEdgeSchema } from "../../core/schemas";
import {
  pageBacklinks,
  pageLinksResource as pageLinksDescriptor,
} from "../../core/resources";
import type { PageLinkEdge } from "../../core/schemas";
import { _pageLinks } from "./tables";

// `data->>'title'` / `data->>'icon'`: the source page's title and icon (an
// emoji) live in the `type="page"` block's `data` JSON.
//
// Both carry the decoder their declared type comes from, so the projection is
// `BacklinkRow` by construction rather than by a cast — `->` hands back whatever
// JSON the block's `data` happens to hold, which is exactly the value worth
// parsing rather than asserting. `orderBy` reuses the same expression object;
// the decoder rides along and is simply never invoked there.
const titleExpr = sql`${liveBlocks.data} ->> 'title'`.mapWith(String);
const iconExpr = sql`${liveBlocks.data} ->> 'icon'`.mapWith(
  nullable(parsed(EmojiSchema, "backlinks.icon")),
);

// The source pages that link TO `pageId`, ordered by title. A db-arm value: the
// loader's read-set (`page_links` and `page_blocks`) is captured at the pool
// chokepoint, so every edge write — the reindexer's insert/delete, the trash
// hook's drop, an FK cascade — and every source page's title / icon edit
// recomputes the subscribed tuples; push drops a byte-identical result.
export const pageBacklinksServed = serveValue(pageBacklinks, {
  source: "db",
  unbounded: {
    reason:
      "the pages that link to one page — a join over page_links and the live page blocks, not the rows of one table",
  },
  loader: async ({ pageId }) =>
    db
      .select({
        id: liveBlocks.id,
        title: titleExpr,
        icon: iconExpr,
      })
      .from(_pageLinks)
      // A trashed source page's edges are dropped by the trash hook; the LIVE
      // join is what makes that a fact rather than a race.
      .innerJoin(liveBlocks, eq(_pageLinks.sourcePageId, liveBlocks.id))
      .where(eq(_pageLinks.targetPageId, pageId))
      // The id breaks a title tie (every "Untitled" source): push compares
      // bytes, so two recomputes over the same rows must not come back in two
      // orders.
      .orderBy(asc(titleExpr), asc(liveBlocks.id)),
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
