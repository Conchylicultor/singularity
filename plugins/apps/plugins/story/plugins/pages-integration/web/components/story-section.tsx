import { MdOpenInNew } from "react-icons/md";
import { navigate } from "@plugins/apps/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
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
 * Embedded story surface in the Pages page-detail pane. Renders only for pages
 * that are already stories — a renderer picker, a live preview, and a link out
 * to the focused Story Builder editor.
 *
 * Converting a plain page into a story is intentionally NOT offered here: a
 * body-level "Make this a story" button read as a debug affordance leaking onto
 * every clean document. Conversion lives in the contextual page-tree row action
 * (`UpgradeAction`, the sidebar's per-page menu), mirroring how Notion keeps
 * page-level conversions in the sidebar rather than the document body.
 *
 * No local state: `markStory`/`unmarkStory` notify `storiesResource`, so the
 * picked renderer (persisted as the marker's `defaultRendererId`) flows straight
 * back through `useStories()`.
 */
export function StorySection({ pageId }: { pageId: string }) {
  const storiesRes = useStories();
  const renderers = Story.Renderer.useContributions();

  if (storiesRes.pending) return null;

  const mark = storiesRes.data.find((m) => m.pageId === pageId) ?? null;

  // Non-story pages show nothing here — conversion is offered through the
  // page-tree row action, not as a body affordance on the document.
  if (!mark) return null;

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
