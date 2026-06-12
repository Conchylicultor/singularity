import { type ReactElement } from "react";
import { MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { BlockEditor } from "@plugins/page/plugins/editor/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { PageHeader } from "./components/page-header";
import { PageDetail } from "./slots";

// Panes are declared first so their types are known before the component
// bodies reference them. The component identifiers below are hoisted function
// declarations, so the forward reference is safe at runtime.

export const pagesRootPane = Pane.define({
  id: "pages-root",
  // Empty segment + `appPath` makes this the Pages app's index pane: bare
  // `/pages` (basePath-stripped to "/") resolves here instead of the global
  // agent-manager welcome pane. The page tree lives in the sidebar slot, so
  // this pane is just the empty-state surface shown before a page is opened.
  segment: "",
  appPath: "/pages",
  component: PagesRoot,
  chrome: false,
  width: 320,
});

function useResolvePage({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((d) => d.id === pageId) };
}

export const pageDetailPane = Pane.define({
  id: "page-detail",
  // No `defaultAncestors`: the page tree lives in the sidebar slot, so the
  // `pages-root` empty-state pane should only appear as the index for bare
  // `/pages` — never stacked as an extra Miller column to the left of an open
  // page. Opening a page therefore yields a single-entry chain that replaces
  // the empty state rather than sitting beside it.
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

function PagesRoot(): ReactElement {
  return (
    <Text
      as="div"
      variant="body"
      className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <MdDescription className="size-8 opacity-50" />
      <p>Select a page from the sidebar, or create a new one.</p>
    </Text>
  );
}

function PageDetailBody(): ReactElement {
  const { pageId } = pageDetailPane.useParams();
  const openPane = useOpenPane();
  const title = usePageTitle({ pageId });

  return (
    <PaneChrome pane={pageDetailPane} title={title}>
      <div className="flex flex-col gap-4 p-4">
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
