import { type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { PageHeader } from "./components/page-header";
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
  const title = usePageTitle({ pageId });

  return (
    <PaneChrome pane={pageDetailPane} title={title}>
      {/* Centered reading column: on wide panes the content stays in a
          comfortable ~768px measure instead of stretching edge-to-edge and
          hugging the left. mx-auto centers it; the generous py keeps the title
          off the top chrome the way Notion's page surface does. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-lg px-lg py-2xl">
        <PageHeader pageId={pageId} />
        <BlockEditor
          pageId={pageId}
          onOpenPage={(id) => openPane(pageDetailPane, { pageId: id }, { mode: "swap" })}
        />
        <PageDetail.Section.Render>
          {(s) => <s.component pageId={pageId} />}
        </PageDetail.Section.Render>
      </div>
    </PaneChrome>
  );
}
