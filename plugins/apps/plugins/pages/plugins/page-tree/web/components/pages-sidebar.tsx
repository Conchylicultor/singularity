import { useMemo } from "react";
import { MdAdd, MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import type {
  RowChromeMenuHelpers,
  RowMenuItem,
} from "@plugins/primitives/plugins/tree/web";
import {
  pagesResource,
  updateBlock,
  moveBlock,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageDetailPane } from "../panes";
import { createPageWithSeed } from "../internal/create-page-with-seed";
import { PageTree } from "../slots";

const PAGES_SIDEBAR_VIEW = defineDataView("pages-sidebar");

export function PagesSidebar() {
  const result = useResource(pagesResource);
  const openPane = useOpenPane();
  const selectedId = pageDetailPane.useRouteEntry()?.params.pageId;

  // Build rows only under the not-pending guard (never the `pending ? [] : data`
  // collapse that makes loading look like a confirmed-empty tree); the render
  // below gates on `result.pending` and shows the skeleton instead.
  let rows: Block[] = [];
  if (!result.pending) {
    rows = result.data;
  }

  // Plain literal (not the tree child's options helper) to respect data-view's
  // collection-consumer separation — consumers never import a view child. The
  // row-menu callback is typed via the tree *primitive's* helper types.
  const viewOptions = useMemo(
    () => ({
      tree: {
        leadingIcon: (b: Block) => (
          <PageIcon nodes={pageData(b).iconSvgNodes} className="size-4" />
        ),
        rowMenu: ({ addBelow }: RowChromeMenuHelpers): RowMenuItem[] => [
          {
            icon: MdAdd,
            label: "Add page below",
            onClick: () => void addBelow(),
          },
        ],
        // Root creation lives on the section header "+" (Notion-style), and
        // per-row sub-page creation on each row's hover "+", so the persistent
        // footer "New Page" line is dropped for a more compact tree.
        addLabel: null,
        dragOverlay: (b: Block) => pageData(b).title || "Untitled",
      },
    }),
    [],
  );

  return (
    <SidebarPaneSection
      title="Pages"
      icon={MdDescription}
      labelExtra={PagesHeaderAdd}
    >
      <Scroll fill className="py-xs">
        {result.pending ? (
          <Loading variant="rows" />
        ) : (
          <DataView<Block>
            rows={rows}
            fields={[
              {
                id: "title",
                label: "Title",
                primary: true,
                value: (b) => pageData(b).title,
                onEdit: async (b, next) => {
                  await fetchEndpoint(
                    updateBlock,
                    { id: b.id },
                    {
                      body: {
                        data: {
                          ...pageData(b),
                          title: String(next ?? "").trim() || "Untitled",
                        },
                      },
                    },
                  );
                },
              },
            ]}
            rowKey={(b) => b.id}
            views={["tree"]}
            storageKey={PAGES_SIDEBAR_VIEW}
            selectedRowId={selectedId}
            onRowActivate={(b) =>
              openPane(pageDetailPane, { pageId: b.id }, { mode: "push" })
            }
            hierarchy={{
              getParentId: (b) => b.parentId,
              getRank: (b) => b.rank,
              isExpanded: (b) => b.expanded,
              onToggleExpanded: (id, next) =>
                void fetchEndpoint(updateBlock, { id }, { body: { expanded: next } }),
              onMove: (id, dest) =>
                void fetchEndpoint(
                  moveBlock,
                  { id },
                  { body: { parentId: dest.parentId, rank: dest.rank } },
                ),
              onCreate: (args) => createPageWithSeed(args),
            }}
            viewOptions={viewOptions}
            itemActions={PageTree.RowActions}
          />
        )}
      </Scroll>
    </SidebarPaneSection>
  );
}

/**
 * Notion-style header "+" for the Pages section: a hover-revealed action in the
 * section label that creates a new top-level page and opens it. Replaces the
 * old persistent footer "New Page" line. Rendered via `SidebarPaneSection`'s
 * `labelExtra` slot, so it lives inside the collapsible header — `stopPropagation`
 * keeps a click from toggling the section.
 */
function PagesHeaderAdd() {
  const openPane = useOpenPane();
  const createRootPage = async () => {
    const id = await createPageWithSeed({ parentId: null });
    openPane(pageDetailPane, { pageId: id }, { mode: "push" });
  };
  return (
    <IconButton
      icon={MdAdd}
      label="New page"
      onClick={(e) => {
        e.stopPropagation();
        return createRootPage();
      }}
      variant="ghost"
      size="icon-xs"
      className="ml-auto opacity-0 pointer-events-none group-hover/label:opacity-100 group-hover/label:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
    />
  );
}
