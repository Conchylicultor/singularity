import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { pagesResource, blocksResource } from "../../core/resources";
import type { Block } from "../../core/schemas";
import { _blocks } from "./tables";

// All pages (`type="page"` blocks), ordered by rank. The sidebar tree is built
// from these by `pageId` (the nearest page ancestor — `parentId` may point at a
// content block).
export const pagesLiveResource = defineResource<Block[]>({
  key: pagesResource.key,
  mode: "push",
  schema: z.array(BlockSchema),
  loader: async () =>
    db
      .select()
      .from(_blocks)
      // Trashed pages disappear from the sidebar; the change-feed re-runs this on
      // the trash/restore UPDATE, so the exclusion is membership-correct.
      .where(and(eq(_blocks.type, PAGE_BLOCK_TYPE), isNull(_blocks.deletedAt)))
      .orderBy(asc(_blocks.rank), asc(_blocks.createdAt)) as unknown as Promise<Block[]>,
});

// A page's content forest: EVERY block whose nearest page ancestor is `pageId`,
// sub-page rows included. There is no type filter, and there must not be — the
// server's reducer (`loadPageBlocks`) has always run over exactly this set, so
// filtering here made client and server mint fractional-index ranks over
// different sibling sets, which is how two siblings ended up sharing `"a0"`.
//
// A sub-page row is automatically a LEAF of this forest: its own content carries
// `page_id = <the sub-page's id>`, a different partition. So `(parent_id, rank)`
// is one real, rendered ordering — the sidebar's page tree is a filtered
// subsequence of it, not a separate ordering space.
export const blocksLiveResource = defineResource<Block[], { pageId: string }>({
  key: blocksResource.key,
  mode: "push",
  schema: z.array(BlockSchema),
  loader: async ({ pageId }) =>
    db
      .select()
      .from(_blocks)
      .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)))
      .orderBy(asc(_blocks.rank), asc(_blocks.createdAt)) as unknown as Promise<Block[]>,
});
