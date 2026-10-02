import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useCurrentPane,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type CreateOption,
} from "@plugins/primitives/plugins/data-view/web";
import type { SectionsToolbar } from "@plugins/primitives/plugins/data-view/core";
import {
  pagesResource,
  updateBlock,
  moveBlock,
  pageData,
  type PageRow,
} from "@plugins/page/plugins/editor/core";
import { pageLinksResource } from "@plugins/page/plugins/links/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { usePageReferenceTint } from "@plugins/page/plugins/page-reference/web";
import { pageDetailPane, pagesTreePane } from "../panes";
import { createPageWithSeed } from "../internal/create-page-with-seed";
import { PageTree } from "../slots";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const addIcon = symbol("add");

const PAGES_SIDEBAR_VIEW = defineDataView("pages-sidebar");

/**
 * Every authored view instance at once — Favorites, Private, Scratch — each
 * under its own collapsible header, instead of a switcher showing one. Module
 * scope: a toolbar spec is data the host reads, one value for the surface.
 *
 * Headers in the `group` form: sentence case in the `group` type role and
 * `groupForeground`, the mockup's quiet "Favorites" / "Private" heads rather
 * than the small-caps eyebrow.
 */
const SECTIONS: SectionsToolbar = {
  kind: "sections",
  forms: { header: "group" },
};

/** The open page's row reads in the title tier: strong text, medium weight. */
const ACTIVE_LABEL = cn("font-medium text-strong-foreground");

const NO_LINK_PARENTS: readonly string[] = [];

export function PagesSidebar() {
  const result = useResource(pagesResource);
  const links = useResource(pageLinksResource);
  const openPane = useOpenPane();
  const tintOf = usePageReferenceTint();
  const selectedId = pageDetailPane.useRouteEntry()?.params.pageId;
  // Where a page opens depends on WHICH host is showing this tree, and the tree
  // can read that off its own position instead of being told:
  //
  //  - The Pages app's sidebar — persistent chrome that stays put whatever is
  //    open — so the page opens as a column BESIDE it ("push").
  //  - The `pagesTreePane` column, opened next to a conversation in another
  //    app — a navigable surface, so activating a row navigates that column to
  //    the page ("swap"), the way a file list moves its own column rather than
  //    growing a third one. `PageBackToTreeAction` in the page's header puts
  //    the tree back.
  const inOwnColumn = useCurrentPane()?.id === pagesTreePane.id;
  const openMode = inOwnColumn ? ("swap" as const) : ("push" as const);

  // target page id → the pages that link to it. Feeds the tree's alias edges,
  // so a page linked from another page shows up as a reference child of the
  // linking page. While the edges are still loading — or when their read
  // failed — the tree simply renders without aliases (they pop in — never a
  // wrong hierarchy; the aliases are an enrichment, the pages read is the
  // tree).
  const linkSourcesByTarget = useMemo(() => {
    const map = new Map<string, string[]>();
    if (links.status === "loading" || links.status === "error") return map;
    for (const edge of links.data) {
      if (edge.sourcePageId === edge.targetPageId) continue;
      const sources = map.get(edge.targetPageId);
      if (sources) sources.push(edge.sourcePageId);
      else map.set(edge.targetPageId, [edge.sourcePageId]);
    }
    return map;
  }, [links]);

  // Build rows only under the ready guard (never the `pending ? [] : data`
  // collapse that makes loading look like a confirmed-empty tree); the DataView
  // gets `readiness={result}`, so the section headers paint immediately and
  // only their bodies show the skeleton — or the failure, with Retry. A
  // `hideWhenEmpty` section (Favorites, Scratch) stays absent until the rows
  // are known, rather than flashing in empty.
  let rows: PageRow[] = [];
  if (result.status === "ready") {
    rows = result.data;
  }

  // id → page block, for resolving a drop/create target's PHYSICAL parent (its
  // raw `parentId`, which may be a content block) from the tree's positional
  // intent — the display hierarchy below runs on `pageId`, a different relation.
  // Keyed on `result` (stable between pushes), not the per-render `rows` array.
  const pagesById = useMemo(() => {
    const map = new Map<string, PageRow>();
    if (result.status === "loading" || result.status === "error") return map;
    for (const b of result.data) map.set(b.id, b);
    return map;
  }, [result]);

  // Plain literals (not the view children's options helpers) to respect
  // data-view's collection-consumer separation — consumers never import a view
  // child.
  const viewOptions = useMemo(() => {
    const activeLabel = (b: PageRow) =>
      b.id === selectedId ? ACTIVE_LABEL : undefined;
    return {
      tree: {
        leadingIcon: (b: PageRow) => (
          <PageIcon icon={pageData(b).icon} className="size-4" />
        ),
        labelClassName: activeLabel,
        // No `rowMenu`: "Add page below" is an ordinary item action
        // (`AddPageBelowAction`) contributed to `PageTree.RowActions`, so the row
        // carries ONE action registry with one authored overflow bucket instead
        // of the tree's "⋯" growing a second, parallel menu beside it.
        //
        // Root creation lives on the Private section header's "+" (the DataView
        // `creators`, narrowed to that section) and the sidebar's own "New page"
        // row, and per-row sub-page creation on each row's hover "+", so the
        // tree's own footer "Add" line is dropped for a more compact tree.
        addLabel: null,
        dragOverlay: (b: PageRow) => pageData(b).title || "Untitled",
        // A decorated KIND of page (an agent-authored one, …) keeps its wash
        // here too, painted as the tree's full-row accent layer — which sits
        // over the row, so it composes with hover and selection instead of
        // replacing them. Tint only: the sidebar has no room for a chip, and
        // a row of no decorated kind paints no layer at all.
        rowAccent: (b: PageRow) => {
          const tint = tintOf(pageData(b));
          return tint === undefined ? null : (
            <div aria-hidden className={cn("size-full rounded-md", tint)} />
          );
        },
      },
      // Favorites (a filtered `list` view) draws its rows through the tree's
      // own row chrome, so a favourite and the same page in the tree below are
      // one row by construction — height, indent, icon box, hover, selection.
      list: {
        rowChrome: "tree" as const,
        leading: (b: PageRow) => (
          <PageIcon icon={pageData(b).icon} className="size-4" />
        ),
        labelClassName: activeLabel,
      },
    };
  }, [tintOf, selectedId]);

  const creators = useMemo<CreateOption[]>(() => {
    const createRootPage = async () => {
      const id = await createPageWithSeed({ parentId: null });
      openPane(pageDetailPane, { pageId: id }, { mode: openMode });
    };
    return [
      {
        id: "new-page",
        label: "New page",
        icon: <Icon icon={addIcon} />,
        onSelect: createRootPage,
        // Only the Private section's header offers it: a new page is a user
        // root page, which lands there — never in Favorites or Scratch.
        views: ["pages"],
      },
    ];
  }, [openPane, openMode]);

  // The DataView's section headers ARE the sidebar chrome (no
  // SidebarPaneSection): every view instance stacks in config order under its
  // own collapsible header. This `Scroll` is the direct flex child of the
  // app-shell sidebar `Stack` — and its only growing item, so the `New page` /
  // `Trash` rows after it sit at the bottom; the DataView never owns a scroll —
  // each section's `Sticky` header pins against it.
  return (
    // `pt-2xs`: with the section heads' own top padding (the theme's
    // `sectionHeadPadTop`), the first head sits where the mockup's does under
    // the search field.
    <Scroll fill className="pt-2xs pb-xs">
      <DataView<PageRow>
        rows={rows}
        readiness={result}
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
        toolbar={SECTIONS}
        searchPlaceholder="Search pages…"
        fieldExtensions={PageTree.Fields}
        creators={creators}
        selectedRowId={selectedId}
        onRowActivate={(b) =>
          openPane(pageDetailPane, { pageId: b.id }, { mode: openMode })
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
          // No expand hooks — the sidebar chevron and the in-document sub-page
          // arrow are deliberately decoupled. This chevron is device-local view
          // state owned by the data-view primitive (per surface + view
          // instance); `page_blocks.expanded` stays genuine DOCUMENT content,
          // written only by the in-document arrow, which mounts the child
          // page's full content inline in its parent's body. Coupling them
          // meant a nav gesture embedded a child page in its parent's
          // document, stamped `updatedAt`, and fanned out `blocksChanged` (a
          // search reindex plus a history snapshot). Matches Notion, whose
          // sidebar arrow only reveals nav children.
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
