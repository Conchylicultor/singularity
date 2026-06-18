import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
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
      <Column
        className="h-full min-h-0 bg-background text-foreground"
        scrollBody={false}
        header={<StoryToolbar.Host />}
        body={<StoryEditorBody />}
      />
    </StoryEditorProvider>
  );
}

/** The editor body: author editor, renderer view, or a split of both. */
function StoryEditorBody() {
  const { pageId, view, split, activeRendererId } = useStoryEditor();

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- horizontal split row; no Column/Frame/Grid primitive models a flex-fill row of independent y-scroll panels
    <div className="flex min-h-0 flex-1">
      {split ? (
        <>
          {/* eslint-disable-next-line layout/no-adhoc-layout -- left split panel: fills half-row with independent y-scroll */}
          <div className="min-h-0 flex-1 overflow-y-auto border-r border-border">
            <BlockEditor pageId={pageId} />
          </div>
          {/* eslint-disable-next-line layout/no-adhoc-layout -- right split panel: fills half-row with independent y-scroll */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <StoryRender pageId={pageId} rendererId={activeRendererId} />
          </div>
        </>
      ) : view === "author" ? (
        // eslint-disable-next-line layout/no-adhoc-layout -- single-panel fill: fills the row with y-scroll
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BlockEditor pageId={pageId} />
        </div>
      ) : (
        // eslint-disable-next-line layout/no-adhoc-layout -- single-panel fill: fills the row with y-scroll
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StoryRender pageId={pageId} rendererId={view} />
        </div>
      )}
    </div>
  );
}
