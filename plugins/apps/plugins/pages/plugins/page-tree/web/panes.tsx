import { useRef, type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { pageDetailRoute } from "@plugins/apps/plugins/pages/plugins/page-tree/core";
import {
  BlockEditor,
  BLOCK_GUTTER,
  type BlockEditorHandle,
} from "@plugins/page/plugins/editor/web";
import { PageHeader } from "./components/page-header";
import { PageBreadcrumb } from "./components/page-breadcrumb";
import { PageCover } from "./components/page-cover";
import { PageDetail } from "./slots";

// The centered reading measure shared by the page header, the block editor's
// content, and the section list, so the page icon, title, and every block line
// up on one left rail with the measure centered in the pane. The block editor's
// pointer/marquee surface spans the full pane width (it receives this only as
// its content wrapper), so drag-to-select works from the whitespace beside the
// column — the header and sections, which carry no such surface, apply the
// measure to themselves directly.
const READING_MEASURE = "mx-auto w-full max-w-4xl px-lg";

// Panes are declared first so their types are known before the component
// bodies reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

function useResolvePage({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((d) => d.id === pageId) };
}

export const pageDetailPane = Pane.define({
  // `pageDetailRoute` has no parent (hence no default ancestors): the page tree
  // lives in the sidebar slot, so the welcome plugin's `pages-root` empty-state
  // pane should only appear as the index for bare `/pages` — never stacked as an
  // extra Miller column to the left of an open page. Opening a page therefore
  // yields a single-entry chain that replaces the empty state rather than
  // sitting beside it.
  route: pageDetailRoute,
  component: PageDetailBody,
  width: 720,
  chrome: { title: (params) => params.pageId },
  resolve: useResolvePage,
  // Tab/document title: the page's title from the global pages resource (same
  // source PageDetailBody renders), falling back to the pageId via chrome.title.
  useTitle: usePageTitle,
});

/** The page's title from the global pages resource, or undefined while loading. */
function usePageTitle({ pageId }: { pageId: string }): string | undefined {
  const result = useResource(pagesResource);
  if (result.pending) return undefined;
  const page = result.data.find((d) => d.id === pageId);
  return page ? pageData(page).title : undefined;
}

function PageDetailBody(): ReactElement {
  const { pageId } = pageDetailPane.useParams();
  const openPane = useOpenPane();
  // The title renders above (outside) the editor's provider, so its Enter key
  // reaches the block tree through the editor's imperative handle.
  const editorRef = useRef<BlockEditorHandle>(null);

  return (
    // The breadcrumb trail is the page's single home for its title — it lives in
    // the pane-chrome bar (passed as `title`), so the big in-body title below
    // appears exactly once.
    <PaneChrome
      pane={pageDetailPane}
      title={<PageBreadcrumb pageId={pageId} />}
      actions={
        <PageDetail.HeaderActions.Render>
          {(s) => <s.component pageId={pageId} />}
        </PageDetail.HeaderActions.Render>
      }
    >
      {/* Full-bleed cover scrolls away with the page (Notion-style). Below it,
          the header and section list are centered on the shared reading measure,
          while the block editor spans the full pane width (centering only its
          own content via the same measure) so a marquee drag can begin from the
          whitespace beside the column. The header and block content each inset
          their text by BLOCK_GUTTER on the left (page icon / hover-control rail)
          and a matching right gutter, so the icon, title, and every block line
          up while the measure stays centered. */}
      <Stack gap="none">
        <PageCover pageId={pageId} />
        <Stack gap="lg" className="pb-2xl">
          {/* Title + body form one tight unit (no flex gap between them): the
              only space under the title is the editor's own top padding, which
              is click-to-edit — so there's no dead strip between title and
              content. */}
          <Stack gap="none">
            <div className={READING_MEASURE} style={{ paddingRight: BLOCK_GUTTER }}>
              <PageHeader
                pageId={pageId}
                onEnter={() => editorRef.current?.insertFirstBlock()}
              />
            </div>
            <BlockEditor
              ref={editorRef}
              pageId={pageId}
              contentClassName={READING_MEASURE}
              onOpenPage={(id) => openPane(pageDetailPane, { pageId: id }, { mode: "swap" })}
            />
          </Stack>
          <div className={READING_MEASURE} style={{ paddingRight: BLOCK_GUTTER }}>
            <PageDetail.Section.Render>
              {(s) => <s.component pageId={pageId} />}
            </PageDetail.Section.Render>
          </div>
        </Stack>
      </Stack>
    </PaneChrome>
  );
}
