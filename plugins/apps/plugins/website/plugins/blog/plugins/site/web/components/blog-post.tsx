import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { blocksResource } from "@plugins/page/plugins/editor/core";
import { BLOCK_INSET } from "@plugins/page/plugins/editor/web";
import {
  ReadOnlyBlocks,
  buildForest,
} from "@plugins/page/plugins/read-only-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { useBlogPosts } from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";
import type { BlogPost } from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";

/** Absolute date — a blog wants "January 5, 2026", not "2 days ago". */
function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Resolve the slug against the published-posts feed, then render the post. Gated
 * on the feed settling (never treats "still loading" as "not found"); an
 * unresolved slug after the feed settles is a genuine 404.
 */
export function BlogPostView({ slug }: { slug: string }) {
  const posts = useBlogPosts();

  if (posts.pending) {
    return (
      <Inset pad="2xl">
        <div className="mx-auto w-full max-w-2xl">
          <Loading variant="rows" count={6} />
        </div>
      </Inset>
    );
  }

  const post = posts.data.find((p) => p.slug === slug) ?? null;
  if (!post) {
    return (
      <Inset pad="2xl">
        <div className="mx-auto w-full max-w-2xl">
          <Placeholder tone="error">Post not found.</Placeholder>
        </div>
      </Inset>
    );
  }

  return <BlogPostContent post={post} />;
}

/**
 * Renders one resolved post: its header (title / date / summary) above the page
 * content rendered read-only via the shared `ReadOnlyBlocks` forest renderer.
 * Split from the resolver so `useResource(blocksResource)` runs with a real
 * pageId (never a placeholder key) and hooks stay unconditional.
 */
function BlogPostContent({ post }: { post: BlogPost }) {
  const blocks = useResource(blocksResource, { pageId: post.pageId });

  if (blocks.pending) {
    return (
      <Inset pad="2xl">
        <div className="mx-auto w-full max-w-2xl">
          <Loading variant="rows" count={6} />
        </div>
      </Inset>
    );
  }

  const forest = buildForest(blocks.data, post.pageId);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Inset pad="2xl">
        <Stack gap="xl">
          <Stack gap="sm">
            {/* Title/date/summary are chrome, not blocks: they sit on the block
                content edge (`C + BLOCK_INSET`), like the page-detail header. */}
            <Inset x={BLOCK_INSET}>
              <Stack gap="xs">
                <Text as="h1" variant="title" className="tracking-tight">
                  {post.title || "Untitled"}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatDate(post.publishedAt)}
                </Text>
                {post.summary ? (
                  <Text as="p" variant="body" tone="muted">
                    {post.summary}
                  </Text>
                ) : null}
              </Stack>
            </Inset>
            {/* A decoration — bleeds to `C`, the full measure. */}
            <div className="border-b" />
          </Stack>
          {forest.length > 0 ? (
            <ReadOnlyBlocks forest={forest} />
          ) : (
            <Placeholder tone="muted">This post has no content.</Placeholder>
          )}
        </Stack>
      </Inset>
    </div>
  );
}
