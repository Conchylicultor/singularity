import { MdDelete } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane, usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { useUndoRedo } from "@plugins/primitives/plugins/undo-redo/web";
import { useUndoableTrash } from "@plugins/infra/plugins/trash/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import {
  pagesResource,
  deleteBlock,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";
import { pageDetailPane } from "../panes";

/**
 * Delete a page from the sidebar — instant, silent, and reversible (Notion's
 * model). There is no confirm dialog because the delete is NOT destructive: the
 * server chokepoint TRASHES any subtree containing a page (soft delete — content,
 * sub-pages, CRDT docs, and version history all survive), so the honest
 * affordance is an Undo, not a "cannot be undone" warning.
 *
 * The undo entry is recorded by the `infra/trash` seam onto the TAB's history, so
 * Cmd+Z restores the page from anywhere in the tab — and the toast's Undo button
 * is just that same `undo()`.
 */
export function DeletePageAction({ row }: ItemActionProps<Block>) {
  const pageId = row.id;
  const title = pageData(row).title;
  const trashWithUndo = useUndoableTrash();
  const { undo } = useUndoRedo();
  const openPane = useOpenPane();
  const paneStore = usePaneStore();
  const pages = useResource(pagesResource);
  const openPageId = pageDetailPane.useRouteEntry()?.params.pageId;

  const onDelete = async () => {
    // Deleting the page the detail pane is showing (or one of its page
    // ancestors) would leave the pane rendering a page that is no longer in the
    // tree — so fall back to the Pages landing surface (the empty route
    // re-resolves to the app's index pane). The `onUndo` hook re-opens it, so
    // Cmd+Z puts the user back exactly where they were.
    const reopenId =
      openPageId !== undefined &&
      !pages.pending &&
      isSelfOrPageAncestor(pages.data, pageId, openPageId)
        ? openPageId
        : undefined;

    await trashWithUndo({
      label: `Delete ${title || "Untitled"}`,
      trash: () => fetchEndpoint(deleteBlock, { id: pageId }),
      onUndo:
        reopenId === undefined
          ? undefined
          : () => openPane(pageDetailPane, { pageId: reopenId }, { mode: "push" }),
    });

    if (reopenId !== undefined) paneStore.clearRoute();

    showToast({
      description: "Page moved to trash",
      action: { label: "Undo", onClick: () => undo() },
    });
  };

  // `IconButton` (as the sibling star row-action already does): it auto-pends
  // while the returned promise is in flight, so the delete cannot be
  // double-fired, and it derives its size from the row's ambient control density.
  return (
    <IconButton
      icon={MdDelete}
      label="Delete page"
      onClick={(e) => {
        e.stopPropagation();
        return onDelete();
      }}
    />
  );
}

/**
 * Is `candidateId` the open page itself, or one of its PAGE ancestors? Walks the
 * denormalized `pageId` chain (each page's nearest page ancestor), which is the
 * true page hierarchy — `parentId` may point at a content block (a sub-page
 * nested inside a toggle), so it is not the chain to walk here.
 */
function isSelfOrPageAncestor(
  pages: Block[],
  candidateId: string,
  openPageId: string,
): boolean {
  if (candidateId === openPageId) return true;
  const byId = new Map(pages.map((p) => [p.id, p]));
  let cursor = byId.get(openPageId)?.pageId ?? null;
  const seen = new Set<string>();
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === candidateId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.pageId ?? null;
  }
  return false;
}
