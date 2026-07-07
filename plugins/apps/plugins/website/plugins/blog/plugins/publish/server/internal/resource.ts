import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _blocks, pageData } from "@plugins/page/plugins/editor/server";
import {
  BlogPostsPayloadSchema,
  type BlogPostsPayload,
} from "../../shared/schemas";
import { blogPost } from "./tables";

const t = blogPost.table;

// The published-post feed: publish-marker rows joined to their page block for
// the title, filtered to actually-published rows, newest first. The loader
// reads both `page_blocks_ext_blog_post` and `page_blocks`, so the change-feed
// recomputes on a publish toggle AND on a page-title edit (read-set capture).
export const blogPostsResource = defineResource<BlogPostsPayload>({
  key: "blog-posts",
  mode: "push",
  schema: BlogPostsPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        pageId: t.parentId,
        slug: t.slug,
        summary: t.summary,
        publishedAt: t.publishedAt,
        data: _blocks.data,
      })
      .from(t)
      .innerJoin(_blocks, eq(_blocks.id, t.parentId))
      .where(isNotNull(t.publishedAt))
      .orderBy(desc(t.publishedAt));
    return rows.map((r) => ({
      pageId: r.pageId,
      slug: r.slug,
      title: pageData({ data: r.data }).title,
      summary: r.summary,
      // Filtered NOT NULL above, so this is always a Date at runtime.
      publishedAt: r.publishedAt as Date,
    }));
  },
});
