import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { pagesResource, blocksResource } from "../../core/resources";
import type { Block } from "../../core/schemas";
import { _blocks } from "./tables";

// All pages (`type="page"` blocks), ordered by rank. The sidebar tree is built
// from these by `parentId`.
export const pagesLiveResource = defineResource<Block[]>({
  key: pagesResource.key,
  mode: "push",
  schema: z.array(BlockSchema),
  loader: async () =>
    db
      .select()
      .from(_blocks)
      .where(eq(_blocks.type, PAGE_BLOCK_TYPE))
      .orderBy(asc(_blocks.rank), asc(_blocks.createdAt)) as unknown as Promise<Block[]>,
});

// A page's content: non-page blocks scoped by `pageId`. The `type <> 'page'`
// filter keeps sub-pages out of the content editor (substrate-only UX).
export const blocksLiveResource = defineResource<Block[], { pageId: string }>({
  key: blocksResource.key,
  mode: "push",
  schema: z.array(BlockSchema),
  loader: async ({ pageId }) =>
    db
      .select()
      .from(_blocks)
      .where(and(eq(_blocks.pageId, pageId), ne(_blocks.type, PAGE_BLOCK_TYPE)))
      .orderBy(asc(_blocks.rank), asc(_blocks.createdAt)) as unknown as Promise<Block[]>,
});
