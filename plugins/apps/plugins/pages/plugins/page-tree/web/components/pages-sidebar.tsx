import { useCallback, useMemo } from "react";
import { MdAdd, MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation, fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  RenameInput,
  RowChrome,
  TreeList,
} from "@plugins/primitives/plugins/tree/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  pagesResource,
  updateBlock,
  moveBlock,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";
import { pageDetailPane } from "../panes";
import { createPageWithSeed } from "../internal/create-page-with-seed";
import { PageTree } from "../slots";

// A page is a `type="page"` block. It carries the tree-shaped fields (id,
// parentId, rank, expanded) directly, so it satisfies TreeItem with no
// projection; title + icon are read out of `data` via `pageData`.
type PageRowData = Block;

function PageRow({ node, depth }: { node: TreeNode<PageRowData>; depth: number }) {
  const { mutateAsync: rename } = useEndpointMutation(updateBlock);
  const { title, icon } = pageData(node);
  return (
    <RowChrome
      node={node}
      depth={depth}
      menu={({ addBelow, addChild }) => [
        { icon: MdAdd, label: "Add page below", onClick: () => void addBelow() },
        { icon: MdAdd, label: "Add sub-page", onClick: () => void addChild() },
      ]}
      actions={
        <PageTree.RowActions.Render>
          {(a) => <a.component pageId={node.id} title={title} />}
        </PageTree.RowActions.Render>
      }
    >
      <span className="text-muted-foreground flex size-4 shrink-0 items-center justify-center text-sm">
        {icon ? icon : <MdDescription className="size-4" />}
      </span>
      <RenameInput
        nodeId={node.id}
        value={title}
        onCommit={async (next) => {
          await rename({
            params: { id: node.id },
            body: { data: { ...pageData(node), title: next } },
          });
        }}
      />
    </RowChrome>
  );
}

export function PagesSidebar() {
  const result = useResource(pagesResource);
  const openPane = useOpenPane();
  const selectedId = pageDetailPane.useRouteEntry()?.params.pageId;

  const rows = useMemo<PageRowData[]>(
    () => (result.pending ? [] : result.data),
    [result],
  );

  const onSelect = useCallback(
    (id: string) => openPane(pageDetailPane, { pageId: id }, { mode: "push" }),
    [openPane],
  );

  const onToggleExpanded = useCallback(
    (id: string, next: boolean) =>
      void fetchEndpoint(updateBlock, { id }, { body: { expanded: next } }),
    [],
  );

  const onMove = useCallback(
    (id: string, dest: { parentId: string | null; rank: Rank }) =>
      void fetchEndpoint(
        moveBlock,
        { id },
        { body: { parentId: dest.parentId, rank: dest.rank } },
      ),
    [],
  );

  // Every create path (root "New Page" and per-row "Add child") flows through
  // TreeList's onCreate, so seeding the empty text block here covers both.
  // Returns the new page id so TreeList opens it.
  const onCreate = useCallback(
    (args: { parentId: string | null; rank?: Rank }) => createPageWithSeed(args),
    [],
  );

  return (
    <SidebarPaneSection title="Pages" icon={MdDescription}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {result.pending ? (
          <Placeholder>Loading…</Placeholder>
        ) : (
          <TreeList<PageRowData>
            rows={rows}
            selectedId={selectedId}
            onSelect={onSelect}
            onToggleExpanded={onToggleExpanded}
            onMove={onMove}
            onCreate={onCreate}
            Row={PageRow}
            dragOverlay={(p) => pageData(p).title || "Untitled"}
            addLabel="New Page"
            toolbar={{ search: { accessor: (p) => pageData(p).title } }}
          />
        )}
      </div>
    </SidebarPaneSection>
  );
}
