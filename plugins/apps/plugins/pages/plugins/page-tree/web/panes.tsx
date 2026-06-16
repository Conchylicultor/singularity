import { type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { BlockEditor, BLOCK_GUTTER } from "@plugins/page/plugins/editor/web";
import { PageHeader } from "./components/page-header";
import { PageBreadcrumb } from "./components/page-breadcrumb";
import { PageCover } from "./components/page-cover";
import { PageDetail } from "./slots";

// Panes are declared first so their types are known before the component
// bodies reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

function useResolvePage({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((d) => d.id === pageId) };
}

export const pageDetailPane = Pane.define({
  id: "page-detail",
  // No `defaultAncestors`: the page tree lives in the sidebar slot, so the
  // welcome plugin's `pages-root` empty-state pane should only appear as the
  // index for bare `/pages` — never stacked as an extra Miller column to the
  // left of an open page. Opening a page therefore yields a single-entry chain
  // that replaces the empty state rather than sitting beside it.
  segment: "page/:pageId",
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
          one centered reading column hosts the header and blocks. The header and
          block editor each self-inset their content by BLOCK_GUTTER (reserving
          the left rail for the page icon and the blocks' hover controls), and
          the column adds a matching right gutter so the icon, title, and every
          block share one left rail while the measure sits centered in the pane
          rather than shifted right against an empty void. */}
      <div className="flex flex-col">
        <PageCover pageId={pageId} />
        <div
          className="mx-auto flex w-full max-w-4xl flex-col gap-lg px-lg pb-2xl"
          style={{ paddingRight: BLOCK_GUTTER }}
        >
          {/* Title + body form one tight unit (no flex gap between them): the
              only space under the title is the editor's own top padding, which
              is click-to-edit — so there's no dead strip between title and
              content. */}
          <div className="flex flex-col">
            <PageHeader pageId={pageId} />
            <BlockEditor
              pageId={pageId}
              onOpenPage={(id) => openPane(pageDetailPane, { pageId: id }, { mode: "swap" })}
            />
          </div>
          <PageDetail.Section.Render>
            {(s) => <s.component pageId={pageId} />}
          </PageDetail.Section.Render>
        </div>
      </div>
    </PaneChrome>
  );
}
