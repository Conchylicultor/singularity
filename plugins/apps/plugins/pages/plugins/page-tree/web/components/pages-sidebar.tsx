import { useMemo } from "react";
import { MdAdd, MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
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

  // Plain function (not useCallback): the `hierarchy` object below is built
  // inline every render anyway, so memoizing this buys nothing — and closing
  // over the per-render `rows` is fine without a dependency array.
  const onRename = async (id: string, next: string) => {
    const block = rows.find((b) => b.id === id);
    if (!block) return;
    await fetchEndpoint(
      updateBlock,
      { id },
      { body: { data: { ...pageData(block), title: next } } },
    );
  };

  // Plain literal (not the tree child's options helper) to respect data-view's
  // collection-consumer separation — consumers never import a view child. The
  // row-menu callback is typed via the tree *primitive's* helper types.
  const viewOptions = useMemo(
    () => ({
      tree: {
        leadingIcon: (b: Block) => (
          <PageIcon nodes={pageData(b).iconSvgNodes} className="size-4" />
        ),
        rowMenu: ({
          addBelow,
          addChild,
        }: RowChromeMenuHelpers): RowMenuItem[] => [
          {
            icon: MdAdd,
            label: "Add page below",
            onClick: () => void addBelow(),
          },
          { icon: MdAdd, label: "Add sub-page", onClick: () => void addChild() },
        ],
        addLabel: "New Page",
        dragOverlay: (b: Block) => pageData(b).title || "Untitled",
      },
    }),
    [],
  );

  return (
    <SidebarPaneSection title="Pages" icon={MdDescription}>
      <div className="min-h-0 flex-1 overflow-y-auto py-xs">
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
              },
            ]}
            rowKey={(b) => b.id}
            views={["tree"]}
            storageKey="pages-sidebar"
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
              onRename,
              onCreate: (args) => createPageWithSeed(args),
            }}
            viewOptions={viewOptions}
            itemActions={PageTree.RowActions}
          />
        )}
      </div>
    </SidebarPaneSection>
  );
}
