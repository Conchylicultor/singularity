import { MdAutoAwesome } from "react-icons/md";
import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";
import {
  hashOutline,
  outlineToBullets,
} from "@plugins/apps/plugins/story/plugins/story-core/core";
import { useGeneratedUnits } from "@plugins/apps/plugins/story/plugins/generation/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Card } from "@plugins/primitives/plugins/card/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { segmentBlog } from "../internal/segment-blog";
import { buildBlogPrompt } from "../internal/build-blog-prompt";

/**
 * Blog lens: turns the outline into an AI-generated continuous article in
 * clean semantic Markdown, generated on-demand and persisted via the
 * generation primitive, then rendered through the Markdown primitive (which
 * themes `##`/`###` headings + `---` rules for free — axis C).
 *
 * `activeRendererId` is unused — the dispatch key already selected this lens.
 */
export function BlogRenderer({
  story,
  pageId,
}: {
  story: StoryNode[];
  pageId: string;
  activeRendererId: string;
}) {
  // v1: a single "article" unit covering the whole outline. The seam where
  // per-section granularity drops in later (segmentBlog returns N units).
  const units = segmentBlog(story);
  const unit = units[0];

  const gen = useGeneratedUnits({
    pageId,
    kind: "blog",
    units: units.map((u) => ({ unitId: u.unitId, currentHash: hashOutline(u.nodes) })),
  });

  // `unit` is always defined (segmentBlog returns ≥1), but the index access is
  // `… | undefined` under noUncheckedIndexedAccess; the guard satisfies the type.
  if (!unit) {
    return (
      <Text tone="muted" variant="body">
        Empty story
      </Text>
    );
  }

  const currentHash = hashOutline(unit.nodes);
  const state = gen.byUnit.get(unit.unitId);
  const status = state?.status ?? "none";

  // While the artifact resource is still loading we don't yet know if an
  // article exists — show loading rather than flashing the Generate CTA.
  if (gen.pending) {
    return <Loading variant="rows" />;
  }

  // Fire-and-forget: the generate mutation persists + enqueues server-side;
  // the resource pushes the status transition back. `void` keeps the click
  // handler lint-safe (no floating promise).
  const onGenerate = () => {
    void gen.generate(unit.unitId, {
      inputHash: currentHash,
      prompt: buildBlogPrompt(unit),
    });
  };

  if (status === "generating") {
    return (
      <Stack gap="sm">
        <Text variant="caption" tone="muted">
          Writing your article…
        </Text>
        <Loading variant="rows" />
      </Stack>
    );
  }

  if (status === "error") {
    return (
      <Stack gap="sm">
        <Text variant="body" tone="destructive">
          {state?.error ?? "Generation failed."}
        </Text>
        <Stack direction="row" gap="sm">
          <Button variant="outline" onClick={onGenerate}>
            Retry
          </Button>
        </Stack>
      </Stack>
    );
  }

  if (status === "ready") {
    return (
      <Card>
        <Stack gap="md">
          {state?.isStale ? (
            <Stack direction="row" align="center" justify="between" gap="sm">
              <Text variant="caption" tone="muted">
                Outline changed since this was written
              </Text>
              <Button variant="outline" onClick={onGenerate}>
                Regenerate
              </Button>
            </Stack>
          ) : null}
          <Markdown>{state?.output ?? ""}</Markdown>
          <Stack direction="row" gap="sm">
            <Button variant="outline" onClick={onGenerate}>
              Regenerate
            </Button>
          </Stack>
        </Stack>
      </Card>
    );
  }

  // status === "none" — nothing generated yet: outline preview + generate CTA.
  return (
    <Card>
      <Stack gap="md">
        <Text variant="body" tone="muted">
          No article yet. Generate a polished blog article from your outline.
        </Text>
        <Text as="pre" variant="caption" tone="muted">
          {outlineToBullets(unit.nodes)}
        </Text>
        <Stack direction="row" gap="sm">
          <Button onClick={onGenerate}>
            <MdAutoAwesome />
            Generate blog
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
