import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { blogPostsResource, type BlogPost } from "../shared/schemas";

/**
 * All published posts (newest first) as a gateable result. Returns the raw
 * pending result while loading (never collapses to `[]`) so consumers can tell
 * "still loading" from "genuinely no posts" — gate on `.pending`.
 */
export function useBlogPosts(): ResourceResult<BlogPost[]> {
  return useResource(blogPostsResource);
}

/**
 * The published post for a page, derived from {@link useBlogPosts}. `null` while
 * loading or when the page is not a published post.
 */
export function useBlogPost(pageId: string | null | undefined): BlogPost | null {
  const result = useResource(blogPostsResource);
  if (!pageId || result.pending) return null;
  return result.data.find((p) => p.pageId === pageId) ?? null;
}
