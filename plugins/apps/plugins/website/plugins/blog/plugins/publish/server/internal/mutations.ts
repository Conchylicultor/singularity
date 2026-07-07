import { and, eq, ne } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { blogPost } from "./tables";

const t = blogPost.table;

export async function getBlogPost(pageId: string) {
  return blogPost.get(pageId);
}

/**
 * Upsert a page's blog-post marker. `slug`/`summary` always overwrite. Publish
 * state is edge-triggered: `published: true` stamps `publishedAt = now()` only
 * when it is currently null (so re-saving a live post keeps its original date);
 * `published: false` clears it back to null (unlisted, but the row stays so the
 * slug/summary persist for a later re-publish).
 *
 * Slug uniqueness is enforced here with a check-then-write. Under Singularity's
 * one-instance-per-user model concurrent publishes of two pages to the same slug
 * are effectively impossible; a DB unique index would be the airtight fix but is
 * unwarranted for a single-writer surface.
 */
export async function setBlogPost(
  pageId: string,
  input: { slug: string; summary: string | null; published: boolean },
): Promise<void> {
  const clash = await db
    .select({ parentId: t.parentId })
    .from(t)
    .where(and(eq(t.slug, input.slug), ne(t.parentId, pageId)))
    .limit(1);
  if (clash.length > 0) {
    throw new HttpError(409, `Slug "${input.slug}" is already used by another post.`);
  }

  const existing = await blogPost.get(pageId);
  const publishedAt = input.published ? (existing?.publishedAt ?? new Date()) : null;

  await blogPost.upsert(pageId, {
    slug: input.slug,
    summary: input.summary,
    publishedAt,
  });
}

// Remove the marker row entirely. FK to page_blocks means a bogus pageId simply
// deletes nothing; the page itself is never touched.
export async function clearBlogPost(pageId: string): Promise<void> {
  await blogPost.delete(pageId);
}
