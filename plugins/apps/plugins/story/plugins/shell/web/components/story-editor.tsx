import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { StoryRender } from "@plugins/apps/plugins/story/plugins/render/web";
import { StoryHeader } from "./story-header";
import { storyDetailPane } from "../panes";
import { StoryEditorProvider, useStoryEditor } from "../context";

/**
 * The focused editor surface. All view state (`view`/`split`) lives in
 * {@link StoryEditorProvider} so the header controls can be zero-prop
 * contributions to the pane's own header slot (`storyDetailPane.Actions`:
 * ← Stories, view switcher) while the body below reads the same state — no
 * header bar is hand-rolled here.
 *
 * The editable story title is the pane's TITLE, not a second header item: a pane
 * already contributes one `title` item into its own header, so re-contributing
 * one would put two items under the same id. It is passed as a node because it
 * needs loaded data (the page row) and is an input rather than a string.
 *
 * The split panels live under the chrome's inert `PaneScroll` (the body root
 * fills it exactly) and keep their own independent y-scroll.
 */
export function StoryEditor() {
  const { pageId } = storyDetailPane.useParams();
  return (
    <StoryEditorProvider pageId={pageId}>
      <PaneChrome
        pane={storyDetailPane}
        title={<StoryHeader pageId={pageId} />}
      >
        <StoryEditorBody />
      </PaneChrome>
    </StoryEditorProvider>
  );
}

/** The editor body: author editor, renderer view, or a split of both. */
function StoryEditorBody() {
  const { pageId, view, split, activeRendererId } = useStoryEditor();

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- horizontal split row filling the chrome's inert PaneScroll (h-full) so the panels keep their own independent y-scroll; no Column/Frame/Grid primitive models a flex-fill row of independent y-scroll panels
    <div className="flex h-full min-h-0 bg-background text-foreground">
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
