import { useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type CreateOption,
} from "@plugins/primitives/plugins/data-view/web";
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
  // collapse that makes loading look like a confirmed-empty tree); the DataView
  // gets `loading={result.pending}`, so the switcher chrome paints immediately
  // and only the body shows the skeleton.
  let rows: Block[] = [];
  if (!result.pending) {
    rows = result.data;
  }

  // Plain literals (not the view children's options helpers) to respect
  // data-view's collection-consumer separation — consumers never import a view
  // child. The tree row-menu callback is typed via the tree *primitive's* helper
  // types.
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
        // Root creation lives on the DataView `creators` "+" (Notion-style), and
        // per-row sub-page creation on each row's hover "+", so the persistent
        // footer "New Page" line is dropped for a more compact tree.
        addLabel: null,
        dragOverlay: (b: Block) => pageData(b).title || "Untitled",
      },
      // Favorites (a filtered `list` view) gets the same page icon + density.
      list: {
        leading: (b: Block) => (
          <PageIcon nodes={pageData(b).iconSvgNodes} className="size-4" />
        ),
        size: "sm" as const,
      },
    }),
    [],
  );

  const creators = useMemo<CreateOption[]>(() => {
    const createRootPage = async () => {
      const id = await createPageWithSeed({ parentId: null });
      openPane(pageDetailPane, { pageId: id }, { mode: "push" });
    };
    return [
      { id: "new-page", label: "New page", icon: <MdAdd />, onSelect: createRootPage },
    ];
  }, [openPane]);

  // The DataView's view switcher IS the sidebar chrome (no SidebarPaneSection).
  // This `Scroll` is the direct flex child of the app-shell sidebar `Stack`;
  // the DataView never owns a scroll — its `Sticky` toolbar pins against it.
  return (
    <Scroll fill className="py-xs">
      <DataView<Block>
        rows={rows}
        loading={result.pending}
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
        views={["tree", "list"]}
        storageKey={PAGES_SIDEBAR_VIEW}
        fieldExtensions={PageTree.Fields}
        creators={creators}
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
          // Positional intent only — never `dest.rank`. These rows are the
          // `type='page'` projection of the `page_blocks` forest, so a rank
          // computed over them collides with the content blocks sharing the
          // same `(parent_id, rank)` space. `handleMoveBlock` mints the rank
          // against the complete sibling set.
          onMove: (id, dest) =>
            void fetchEndpoint(
              moveBlock,
              { id },
              {
                body: {
                  parentId: dest.parentId,
                  targetId: dest.targetId,
                  zone: dest.zone,
                },
              },
            ),
          onCreate: (args) => createPageWithSeed(args),
        }}
        viewOptions={viewOptions}
        itemActions={PageTree.RowActions}
      />
    </Scroll>
  );
}
