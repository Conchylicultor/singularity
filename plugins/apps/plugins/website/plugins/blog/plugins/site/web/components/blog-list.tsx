import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { useBlogPosts } from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";
import type { BlogPost } from "@plugins/apps/plugins/website/plugins/blog/plugins/publish/web";
import { blogPostPane } from "../panes";

/** Absolute date — a blog wants "January 5, 2026", not "2 days ago". */
function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The blog index body: a single centered reading column of published posts,
 * newest first. Gates on the resource's pending state (never renders a
 * confidently-empty list while loading); the empty state is an explicit
 * placeholder.
 */
export function BlogList() {
  const posts = useBlogPosts();

  if (posts.pending) {
    return (
      <Inset pad="2xl">
        <div className="mx-auto w-full max-w-2xl">
          <Loading variant="rows" count={5} />
        </div>
      </Inset>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Inset pad="2xl">
        <Stack gap="xl">
          <Stack gap="xs">
            <Text variant="eyebrow" tone="primary">
              Blog
            </Text>
            <Text as="h1" variant="title" className="tracking-tight">
              Notes from building equin
            </Text>
          </Stack>
          {posts.data.length === 0 ? (
            <Placeholder tone="muted">No posts yet.</Placeholder>
          ) : (
            <Stack gap="xs">
              {posts.data.map((post) => (
                <BlogListEntry key={post.pageId} post={post} />
              ))}
            </Stack>
          )}
        </Stack>
      </Inset>
    </div>
  );
}

function BlogListEntry({ post }: { post: BlogPost }) {
  const openPane = useOpenPane();
  return (
    <button
      type="button"
      onClick={() => openPane(blogPostPane, { slug: post.slug }, { mode: "root" })}
      className="group w-full rounded-lg text-left transition-colors hover:bg-muted/50"
    >
      <Inset pad="md">
        <Stack gap="2xs">
          <Text as="h2" variant="subheading">
            {post.title || "Untitled"}
          </Text>
          {post.summary ? (
            <Text as="p" variant="body" tone="muted">
              {post.summary}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {formatDate(post.publishedAt)}
          </Text>
        </Stack>
      </Inset>
    </button>
  );
}
