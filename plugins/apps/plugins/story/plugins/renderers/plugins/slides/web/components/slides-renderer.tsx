import { useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { StoryContentTree } from "./story-content-tree";

/**
 * Slices the top-level story into slides. If any top-level node is a "break"
 * (divider), the deck splits at those breaks — each run between breaks is one
 * slide and the break nodes are dropped (empty leading/trailing/consecutive
 * runs collapse away). With no top-level breaks, each top-level node is its own
 * slide. Pure: descendants travel with their top-level node and render via the
 * recursive content tree.
 */
export function buildSlides(story: StoryNode[]): StoryNode[][] {
  const hasBreak = story.some((node) => node.role === "break");
  if (!hasBreak) return story.map((node) => [node]);

  const slides: StoryNode[][] = [];
  let run: StoryNode[] = [];
  for (const node of story) {
    if (node.role === "break") {
      if (run.length > 0) slides.push(run);
      run = [];
    } else {
      run.push(node);
    }
  }
  if (run.length > 0) slides.push(run);
  return slides;
}

/**
 * Slides lens: presents the story as a 16:9 deck with prev/next navigation.
 * `activeRendererId` is unused — the dispatch key already selected this lens.
 */
export function SlidesRenderer({ story }: { story: StoryNode[]; activeRendererId: string }) {
  const slides = buildSlides(story);
  const [index, setIndex] = useState(0);
  // Clamp on render so a shrinking deck never points past the last slide.
  const safeIndex = Math.min(index, Math.max(0, slides.length - 1));

  // `current` is always defined when there is ≥1 slide (safeIndex is clamped in
  // range), but the index access is `… | undefined` under noUncheckedIndexedAccess;
  // the explicit guard both satisfies the type and renders the empty-story state.
  const current = slides[safeIndex];
  if (!current) {
    return (
      <div className="flex h-full items-center justify-center">
        <Text tone="muted" variant="body">
          Empty story
        </Text>
      </div>
    );
  }

  return (
    <Stack gap="sm">
      <Card className="aspect-[16/9] overflow-auto rounded-lg p-xl">
        <StoryContentTree nodes={current} />
      </Card>
      <Stack direction="row" gap="sm" align="center" justify="center">
        <IconButton
          icon={MdChevronLeft}
          label="Previous slide"
          onClick={() => setIndex(safeIndex - 1)}
          disabled={safeIndex <= 0}
        />
        <Text variant="caption" tone="muted">
          {safeIndex + 1} / {slides.length}
        </Text>
        <IconButton
          icon={MdChevronRight}
          label="Next slide"
          onClick={() => setIndex(safeIndex + 1)}
          disabled={safeIndex >= slides.length - 1}
        />
      </Stack>
    </Stack>
  );
}
