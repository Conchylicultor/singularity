import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  WebsitePage,
  WebsiteToolbar,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { useBlogPosts } from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";
import { BlogList } from "./components/blog-list";
import { BlogPostView } from "./components/blog-post";

/**
 * The blog index at `/website/blog`: a constrained reading column of published
 * posts, newest first. Opts into the shared site header (`WebsiteToolbar`) and
 * wraps its body in `WebsitePage` so the site footer renders exactly once.
 */
export const blogListPane = Pane.define({
  id: "website-blog",
  segment: "blog",
  chrome: { header: WebsiteToolbar },
  component: BlogListBody,
});

function BlogListBody() {
  return (
    <PaneChrome pane={blogListPane}>
      <WebsitePage>
        <BlogList />
      </WebsitePage>
    </PaneChrome>
  );
}

/**
 * A single published post at `/website/blog/:slug` — the post header plus its
 * page content rendered read-only. The segment is self-contained (it carries
 * its own `blog/` prefix), so the pane opens as a root with NO ancestors — an
 * ancestor list pane would double the prefix in the derived URL.
 */
export const blogPostPane = Pane.define({
  id: "website-blog-post",
  segment: "blog/:slug",
  chrome: { header: WebsiteToolbar },
  resolve: useBlogPostResolve,
  component: BlogPostBody,
});

/**
 * Resolve gate for deep links: pend while the published feed loads, not-found
 * when the slug isn't a published post. Mirrors story-detail's resolve hook.
 */
function useBlogPostResolve({ slug }: { slug: string }) {
  const posts = useBlogPosts();
  return {
    pending: posts.pending,
    found: !posts.pending && posts.data.some((p) => p.slug === slug),
  };
}

function BlogPostBody() {
  const { slug } = blogPostPane.useParams();
  return (
    <PaneChrome pane={blogPostPane}>
      <WebsitePage>
        <BlogPostView slug={slug} />
      </WebsitePage>
    </PaneChrome>
  );
}
