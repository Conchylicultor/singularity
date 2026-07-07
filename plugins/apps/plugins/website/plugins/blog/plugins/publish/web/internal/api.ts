import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  setBlogPost as setBlogPostEndpoint,
  clearBlogPost as clearBlogPostEndpoint,
} from "../../shared/endpoints";

/**
 * Publish/update a page's blog-post marker. `published: true` publishes (stamps
 * the date on the first publish); `published: false` unlists it while keeping
 * the slug/summary. Slug must be lowercase kebab-case and unique — the server
 * rejects a malformed slug (400) or a collision (409).
 */
export async function setBlogPost(
  pageId: string,
  input: { slug: string; summary: string | null; published: boolean },
): Promise<void> {
  await fetchEndpoint(setBlogPostEndpoint, { pageId }, { body: input });
}

/** Remove a page's blog-post marker entirely (the page itself is untouched). */
export async function clearBlogPost(pageId: string): Promise<void> {
  await fetchEndpoint(clearBlogPostEndpoint, { pageId });
}
