import { useState } from "react";
import { MdOpenInNew } from "react-icons/md";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text, SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  useBlogPosts,
  setBlogPost,
  SLUG_RE,
} from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";
import type { BlogPost } from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";

/** Derive a lowercase kebab-case slug from a page title (default for a new post). */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Embedded blog-publish surface in the Pages page-detail pane. Unlike Story's
 * embedded section (which only appears once a page is already a story), the blog
 * panel is the publish affordance itself, so it renders on every page: an
 * unpublished page shows a slug + summary form and a Publish button; a published
 * page shows its slug, date, "View on site", and Unpublish.
 *
 * No local persistence: `setBlogPost` notifies `blogPostsResource`, so the
 * published state flows straight back through `useBlogPosts()`.
 */
export function BlogPublishPanel({ pageId }: { pageId: string }) {
  const pagesResult = useResource(pagesResource);
  const postsResult = useBlogPosts();

  // Gate on both feeds so we never flash the unpublished form over a published
  // page (or seed the slug before the title has loaded).
  if (pagesResult.pending || postsResult.pending) return null;

  const pageBlock = pagesResult.data.find((b) => b.id === pageId);
  const title = pageBlock ? pageData(pageBlock).title : "";
  const post = postsResult.data.find((p) => p.pageId === pageId) ?? null;

  return (
    <Stack gap="sm">
      <SectionLabel>Blog</SectionLabel>
      {/* Keyed by pageId so the slug form re-seeds when switching pages. */}
      <PublishForm key={pageId} pageId={pageId} title={title} post={post} />
    </Stack>
  );
}

function PublishForm({
  pageId,
  title,
  post,
}: {
  pageId: string;
  title: string;
  post: BlogPost | null;
}) {
  const [slug, setSlug] = useState(() => post?.slug ?? slugify(title));
  const [summary, setSummary] = useState(() => post?.summary ?? "");

  if (post) {
    return (
      <Stack gap="sm">
        <Text variant="body" tone="muted">
          Published {formatDate(post.publishedAt)} at /blog/{post.slug}
        </Text>
        <Inline gap="sm">
          <Button
            variant="ghost"
            onClick={() => navigate(`/website/blog/${post.slug}`)}
          >
            <MdOpenInNew className="size-4" />
            View on site
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              void setBlogPost(pageId, {
                slug: post.slug,
                summary: post.summary,
                published: false,
              })
            }
          >
            Unpublish
          </Button>
        </Inline>
      </Stack>
    );
  }

  const trimmedSlug = slug.trim();
  const canPublish = SLUG_RE.test(trimmedSlug);

  return (
    <Stack gap="sm">
      <Input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="post-slug"
        aria-label="Post slug"
      />
      <Input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Optional one-line summary"
        aria-label="Post summary"
      />
      <Inline gap="sm">
        <Button
          variant="default"
          disabled={!canPublish}
          onClick={() =>
            void setBlogPost(pageId, {
              slug: trimmedSlug,
              summary: summary.trim() || null,
              published: true,
            })
          }
        >
          Publish
        </Button>
      </Inline>
    </Stack>
  );
}
