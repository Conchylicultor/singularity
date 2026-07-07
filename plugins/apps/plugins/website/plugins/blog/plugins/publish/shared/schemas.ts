import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// One published blog post: the publish-marker fields joined with the page
// block's title. `publishedAt` is non-null here — the resource only surfaces
// rows that are actually published (drafts are filtered out server-side).
export const BlogPostSchema = z.object({
  pageId: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  publishedAt: z.coerce.date(),
});
export type BlogPost = z.infer<typeof BlogPostSchema>;

// An ordered list (newest first) — order is load-bearing for a blog, so the
// payload is an array rather than a keyed record. `useBlogPost(pageId)` derives
// a single post by a linear find.
export const BlogPostsPayloadSchema = z.array(BlogPostSchema);
export type BlogPostsPayload = z.infer<typeof BlogPostsPayloadSchema>;

export const blogPostsResource = resourceDescriptor<BlogPostsPayload>(
  "blog-posts",
  BlogPostsPayloadSchema,
  [],
);
