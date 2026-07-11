import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pagesResource } from "@plugins/page/plugins/editor/core";
import { StoryGallery } from "./components/story-gallery";
import { StoryEditor } from "./components/story-editor";
import { StoryToolbar } from "./toolbar";

/**
 * The gallery index pane — Story's landing surface at bare `/story`. Empty
 * segment + `appPath` makes it the app's index pane (the empty route resolves
 * here). Standard chrome with a "Stories" title; the `DataView` body owns its
 * own virtualization inside the chrome's single `PaneScroll`.
 */
export const storyGalleryPane = Pane.define({
  id: "story-gallery",
  segment: "",
  appPath: "/story",
  component: StoryGalleryBody,
});

function StoryGalleryBody() {
  return (
    <PaneChrome pane={storyGalleryPane} title="Stories">
      <StoryGallery />
    </PaneChrome>
  );
}

/**
 * The editor pane at `/story/s/:pageId` — a real URL that survives reload and
 * back/forward. Opened with `mode:"root"` so each open replaces the route with a
 * single full-surface pane. `resolve` gates the pane on the page existing on
 * direct navigation / reload. The toolbar reads the title from `pagesResource`,
 * which is its only owner — the pane carries no optimistic copy.
 */
export const storyDetailPane = Pane.define({
  id: "story-detail",
  segment: "s/:pageId",
  chrome: { header: StoryToolbar },
  resolve: useStoryDetailResolve,
  component: StoryEditor,
});

/**
 * Resolve hook: gate the editor pane on the page existing. Blocks load lazily
 * inside `<BlockEditor>` / `<StoryRender>`, so no async hydration is needed here
 * — only the page-existence check, which also runs on a deep-linked
 * `/story/s/:id`.
 */
function useStoryDetailResolve({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  const found = !result.pending && result.data.some((p) => p.id === pageId);
  return { pending: result.pending, found };
}
