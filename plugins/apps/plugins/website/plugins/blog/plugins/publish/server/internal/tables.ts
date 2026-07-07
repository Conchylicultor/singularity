import { text, timestamp } from "drizzle-orm/pg-core";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// page_blocks_ext_blog_post(parent_id PK FK→page_blocks CASCADE, slug text NOT
// NULL, summary text NULL, published_at timestamptz NULL, created_at,
// updated_at). Presence of a row = the page is a blog post; `published_at` NULL
// means drafted-but-not-published (never publicly listed).
export const blogPost = defineExtension(_blocks, "blog_post", {
  slug: text("slug").notNull(),
  summary: text("summary"), // nullable: an optional one-line teaser
  publishedAt: timestamp("published_at", { withTimezone: true }), // NULL = unpublished
});
// Re-exported so drizzle-kit's schema glob discovers the underlying pgTable.
export const _blogPostExt = blogPost.table;
