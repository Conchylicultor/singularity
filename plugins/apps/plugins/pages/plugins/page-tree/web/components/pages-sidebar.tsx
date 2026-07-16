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
  type PageRow,
} from "@plugins/page/plugins/editor/core";
import { pageLinksResource } from "@plugins/page/plugins/links/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageDetailPane } from "../panes";
import { createPageWithSeed } from "../internal/create-page-with-seed";
import { PageTree } from "../slots";

const PAGES_SIDEBAR_VIEW = defineDataView("pages-sidebar");

const NO_LINK_PARENTS: readonly string[] = [];

export function PagesSidebar() {
  const result = useResource(pagesResource);
  const links = useResource(pageLinksResource);
  const openPane = useOpenPane();
  const selectedId = pageDetailPane.useRouteEntry()?.params.pageId;

  // target page id → the pages that link to it. Feeds the tree's alias edges,
  // so a page linked from another page shows up as a reference child of the
  // linking page. While the edges are still loading the tree simply renders
  // without aliases (they pop in — never a wrong hierarchy).
  const linkSourcesByTarget = useMemo(() => {
    const map = new Map<string, string[]>();
    if (links.pending) return map;
    for (const edge of links.data) {
      if (edge.sourcePageId === edge.targetPageId) continue;
      const sources = map.get(edge.targetPageId);
      if (sources) sources.push(edge.sourcePageId);
      else map.set(edge.targetPageId, [edge.sourcePageId]);
    }
    return map;
  }, [links]);

  // Build rows only under the not-pending guard (never the `pending ? [] : data`
  // collapse that makes loading look like a confirmed-empty tree); the DataView
  // gets `loading={result.pending}`, so the switcher chrome paints immediately
  // and only the body shows the skeleton.
  let rows: PageRow[] = [];
  if (!result.pending) {
    rows = result.data;
  }

  // id → page block, for resolving a drop/create target's PHYSICAL parent (its
  // raw `parentId`, which may be a content block) from the tree's positional
  // intent — the display hierarchy below runs on `pageId`, a different relation.
  // Keyed on `result` (stable between pushes), not the per-render `rows` array.
  const pagesById = useMemo(() => {
    const map = new Map<string, PageRow>();
    if (result.pending) return map;
    for (const b of result.data) map.set(b.id, b);
    return map;
  }, [result]);

  // Plain literals (not the view children's options helpers) to respect
  // data-view's collection-consumer separation — consumers never import a view
  // child. The tree row-menu callback is typed via the tree *primitive's* helper
  // types.
  const viewOptions = useMemo(
    () => ({
      tree: {
        leadingIcon: (b: PageRow) => (
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
        dragOverlay: (b: PageRow) => pageData(b).title || "Untitled",
      },
      // Favorites (a filtered `list` view) gets the same page icon + density.
      list: {
        leading: (b: PageRow) => (
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
      <DataView<PageRow>
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
          // The page hierarchy is `pageId` (the denormalized nearest PAGE
          // ancestor), NOT the raw block-forest `parentId`: a sub-page's direct
          // parent may be a content block (nested under a text line, a toggle,
          // …), which would orphan it to the sidebar's root. `pageId` is also
          // invariant under intra-page block moves — indenting a sub-page block
          // inside its page never changes which page it belongs to.
          getParentId: (b) => b.pageId,
          // Pages a page links to (page-link blocks, inline [[links]]) appear
          // as read-only reference children of the linking page.
          getAliasParents: (b) =>
            linkSourcesByTarget.get(b.id) ?? NO_LINK_PARENTS,
          // `docRank`, NOT the storage `rank`: a `rank` is comparable only
          // within one `(parent_id, rank)` space, and this sibling group (pages
          // sharing a `pageId`) can span several — some sub-pages are direct
          // children of the page, others sit under a text line / toggle. The
          // server mints `docRank` per group from true document order, so
          // display order, array order, and `computeFlatReorder`'s rank-sorted
          // neighbourhood are now ONE order. They silently disagreed before:
          // display followed the array (a global rank sort), the DnD arithmetic
          // re-sorted the sibling set — so a drop resolved against neighbours
          // the user never saw, or hit a cross-space duplicate rank and aborted.
          getRank: (b) => b.docRank,
          isExpanded: (b) => b.expanded,
          onToggleExpanded: (id, next) =>
            void fetchEndpoint(updateBlock, { id }, { body: { expanded: next } }),
          // Positional intent only — never `dest.rank`. These rows are the
          // `type='page'` projection of the `page_blocks` forest, so a rank
          // computed over them collides with the content blocks sharing the
          // same `(parent_id, rank)` space. `handleMoveBlock` mints the rank
          // against the complete sibling set.
          //
          // Sibling drops resolve against the TARGET's physical parent: the
          // display parent (`dest.parentId`) is the page-level `pageId`
          // relation, while `moveBlock` validates `targetId` against the raw
          // block forest — and the target block may physically sit under a
          // content block within that page. A child drop (`targetId: null`)
          // parents directly under the destination page block.
          onMove: (id, dest) => {
            const target =
              dest.targetId === null ? undefined : pagesById.get(dest.targetId);
            void fetchEndpoint(
              moveBlock,
              { id },
              {
                body: {
                  parentId: target ? target.parentId : dest.parentId,
                  targetId: dest.targetId,
                  zone: dest.zone,
                },
              },
            );
          },
          // Same physical-parent resolution for "Add page below": the new page
          // must be a sibling of `afterId`'s BLOCK, wherever it physically sits.
          onCreate: (args) => {
            const after =
              args.afterId === undefined
                ? undefined
                : pagesById.get(args.afterId);
            return after
              ? createPageWithSeed({
                  parentId: after.parentId,
                  afterId: after.id,
                })
              : createPageWithSeed({ parentId: args.parentId });
          },
        }}
        viewOptions={viewOptions}
        itemActions={PageTree.RowActions}
      />
    </Scroll>
  );
}
