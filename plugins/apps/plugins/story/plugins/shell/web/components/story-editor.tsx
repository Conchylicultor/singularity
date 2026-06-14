import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { StoryRender } from "@plugins/apps/plugins/story/plugins/render/web";
import { storyDetailPane } from "../panes";
import { StoryToolbar } from "../toolbar";
import { StoryEditorProvider, useStoryEditor } from "../context";

/**
 * The focused editor surface. All view state (`view`/`split`) lives in
 * {@link StoryEditorProvider} so the toolbar elements can be zero-prop render-slot
 * contributions to {@link StoryToolbar} (← Stories, title, view switcher) while
 * the body below reads the same state. The bar is routed through the PaneToolbar
 * primitive — hand-rolling a `border-b` header here is banned by the
 * `no-adhoc-pane-toolbar` lint rule.
 */
export function StoryEditor() {
  const { pageId } = storyDetailPane.useParams();
  return (
    <StoryEditorProvider pageId={pageId}>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <StoryToolbar.Host />
        <StoryEditorBody />
      </div>
    </StoryEditorProvider>
  );
}

/** The editor body: author editor, renderer view, or a split of both. */
function StoryEditorBody() {
  const { pageId, view, split, activeRendererId } = useStoryEditor();

  return (
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
  );
}
