import { MdAutoStories, MdOpenInNew } from "react-icons/md";
import { navigate } from "@plugins/apps/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import {
  useStories,
  markStory,
} from "@plugins/apps/plugins/story/plugins/marker/web";
import {
  Story,
  StoryRender,
  RendererPicker,
} from "@plugins/apps/plugins/story/plugins/render/web";

/**
 * Embedded story surface in the Pages page-detail pane. When the page is a story
 * it shows a renderer picker, a live preview, and a link out to the focused Story
 * Builder editor; otherwise a subtle "Make this a story" affordance.
 *
 * No local state: `markStory`/`unmarkStory` notify `storiesResource`, so the
 * picked renderer (persisted as the marker's `defaultRendererId`) flows straight
 * back through `useStories()`.
 */
export function StorySection({ pageId }: { pageId: string }) {
  const storiesRes = useStories();
  const renderers = Story.Renderer.useContributions();

  // Hold the section until the marker set resolves — flashing the "Make this a
  // story" affordance before flipping to the preview would be jarring.
  if (storiesRes.pending) return null;

  const mark = storiesRes.data.find((m) => m.pageId === pageId) ?? null;

  if (!mark) {
    return (
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground self-start"
        onClick={() => markStory(pageId)}
      >
        <MdAutoStories className="size-4" />
        Make this a story
      </Button>
    );
  }

  // Embedded preview falls back to the first contributed renderer when the story
  // has no saved default, so it shows something useful immediately (the picker
  // highlights the same id). The fallback is never persisted — only an explicit
  // pick writes `defaultRendererId`.
  const activeId = mark.defaultRendererId ?? renderers[0]?.id ?? null;

  return (
    <Stack gap="sm">
      <div className="flex items-center justify-between">
        <SectionLabel>Story</SectionLabel>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => navigate(`/story/s/${pageId}`)}
        >
          <MdOpenInNew className="size-4" />
          Open in Story Builder
        </Button>
      </div>
      <RendererPicker
        activeId={activeId}
        onSelect={(id) => void markStory(pageId, id)}
      />
      <div className="max-h-96 overflow-y-auto rounded-md border border-border">
        <StoryRender pageId={pageId} rendererId={activeId ?? ""} />
      </div>
    </Stack>
  );
}
