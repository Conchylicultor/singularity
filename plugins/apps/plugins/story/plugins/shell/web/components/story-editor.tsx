import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useState } from "react";
import { MdChevronLeft } from "react-icons/md";
import { clearRoute } from "@plugins/primitives/plugins/pane/web";
import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { StoryRender } from "@plugins/apps/plugins/story/plugins/render/web";
import { useStories, markStory } from "@plugins/apps/plugins/story/plugins/marker/web";
import { storyDetailPane } from "../panes";
import { StoryHeader } from "./story-header";
import { StoryViewSwitcher } from "./story-view-switcher";

/**
 * The focused editor surface. Owns all view state: `view` (the active switcher
 * segment — `"author"` or a renderer id) and `split` (whether to show the
 * renderer preview beside the editor). The renderer *choice* persists across
 * sessions via the marker's `defaultRendererId`; the transient `view`/`split`
 * are local.
 */
export function StoryEditor() {
  const { pageId } = storyDetailPane.useParams();

  // The persisted default renderer for this story (null until the user picks
  // one). Read back from the marker so reopening the story restores the lens.
  const defaultRendererId =
    useStories().find((m) => m.pageId === pageId)?.defaultRendererId ?? null;

  const [view, setView] = useState<string>("author");
  const [split, setSplit] = useState(false);

  // When the user switches to a renderer, that becomes this story's persisted
  // default lens. "author" is a transient editor mode, not a renderer, so it is
  // never written back to the marker.
  const onView = (next: string) => {
    setView(next);
    if (next !== "author") void markStory(pageId, next);
  };

  // The renderer the preview pane should show. In a renderer view it is the
  // active view; in author view it falls back to the persisted default (or `""`,
  // which matches no contribution → `<StoryRender>` shows its visible
  // "No renderer available" fallback, the substrate proof before any renderer
  // plugin exists).
  const activeRendererId = view !== "author" ? view : (defaultRendererId ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 border-b border-border py-3 pl-4 pr-floating-bar">
        <Button variant="outline" size="xs" onClick={() => clearRoute()}>
          <MdChevronLeft className="size-4" />
          Stories
        </Button>
        <StoryHeader pageId={pageId} />
        <StoryViewSwitcher
          view={view}
          onView={onView}
          split={split}
          onToggleSplit={() => setSplit((s) => !s)}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {split ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto border-r border-border">
              <BlockEditor pageId={pageId} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <StoryRender pageId={pageId} rendererId={activeRendererId} />
            </div>
          </>
        ) : view === "author" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BlockEditor pageId={pageId} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <StoryRender pageId={pageId} rendererId={view} />
          </div>
        )}
      </div>
    </div>
  );
}
