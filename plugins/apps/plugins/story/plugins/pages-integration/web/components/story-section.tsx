import { MdOpenInNew } from "react-icons/md";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  useIsStory,
  useStories,
  markStory,
} from "@plugins/apps/plugins/story/plugins/marker/web";
import {
  Story,
  StoryRender,
  RendererPicker,
} from "@plugins/apps/plugins/story/plugins/render/web";

/**
 * Embedded story surface in the Pages page-detail pane — a renderer picker, a
 * live preview, and (in the card's header) a link out to the focused Story
 * Builder editor. The "Story" title and its card are painted by the
 * `PageDetail.Section` host; this is the body only.
 *
 * Whether it appears at all is the contribution's `useAvailable`
 * (`useIsStoryPage`), NOT a `return null` here: the host owns the chrome, so a
 * null body would leave an empty "Story" card on every plain page.
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
  if (!mark) return null;

  // Embedded preview falls back to the first contributed renderer when the story
  // has no saved default, so it shows something useful immediately (the picker
  // highlights the same id). The fallback is never persisted — only an explicit
  // pick writes `defaultRendererId`.
  const activeId = mark.defaultRendererId ?? renderers[0]?.id ?? null;

  return (
    <Stack gap="sm">
      <RendererPicker
        activeId={activeId}
        onSelect={(id) => void markStory(pageId, id)}
      />
      <Scroll className="max-h-96 rounded-md border border-border">
        <StoryRender pageId={pageId} rendererId={activeId ?? ""} />
      </Scroll>
    </Stack>
  );
}

/**
 * The section's header action: a hand-off to the focused Story Builder editor.
 * It lives on the contribution's `actions` rather than in the body so it stays
 * reachable while the card is collapsed.
 */
export function StorySectionActions({ pageId }: { pageId: string }) {
  return (
    <Button variant="ghost" onClick={() => navigate(`/story/s/${pageId}`)}>
      <MdOpenInNew className="icon-auto" />
      Open in Story Builder
    </Button>
  );
}

/**
 * The section's `useAvailable` gate — a plain (non-story) page paints no card at
 * all, so the story surface never leaks onto a clean document.
 */
export function useIsStoryPage({ pageId }: { pageId: string }): boolean {
  return useIsStory(pageId);
}
