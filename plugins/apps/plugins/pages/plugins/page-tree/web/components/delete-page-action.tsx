import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@plugins/primitives/plugins/ui-kit/web";
import { useState } from "react";
import { MdDelete } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import {
  pagesResource,
  deleteBlock,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";

/**
 * Subtree delete is destructive: deleting a page FK-cascades its blocks AND
 * every descendant page. Gate it behind a confirm dialog that names the
 * descendant count.
 *
 * The Delete button and confirm dialog are disabled while pages data is still
 * loading: showing "0 sub-pages" when the count is unknown would mislead the
 * user into believing there are no children when there may be many.
 */
export function DeletePageAction({ row }: ItemActionProps<Block>) {
  const pageId = row.id;
  const title = pageData(row).title;
  const [open, setOpen] = useState(false);
  const result = useResource(pagesResource);
  const { mutateAsync } = useEndpointMutation(deleteBlock);

  const onConfirm = async () => {
    await mutateAsync({ params: { id: pageId } });
    setOpen(false);
  };

  // Never open the dialog while the page tree is still loading — we cannot know
  // the descendant count yet, and showing "0 sub-pages" would be dangerously wrong.
  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!result.pending) setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={result.pending}
        title="Delete page"
        aria-label="Delete page"
        className="hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <MdDelete className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Delete page</DialogTitle>
          {!result.pending && (
            <DialogDescription>
              Delete <span className="font-medium">{title || "Untitled"}</span>
              {(() => {
                const count = countDescendants(result.data, pageId);
                return count > 0
                  ? ` and ${count} sub-page${count === 1 ? "" : "s"}`
                  : "";
              })()}
              ? This also removes all of their content and cannot be undone.
            </DialogDescription>
          )}
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- action row offset below the dialog description; one-off dialog footer spacing */}
          <div className="mt-4 flex justify-end gap-sm">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void onConfirm()}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function countDescendants(
  docs: { id: string; parentId: string | null }[],
  rootId: string,
): number {
  const childrenOf = new Map<string, string[]>();
  for (const d of docs) {
    if (d.parentId) {
      const arr = childrenOf.get(d.parentId) ?? [];
      arr.push(d.id);
      childrenOf.set(d.parentId, arr);
    }
  }
  let count = 0;
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    count++;
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return count;
}
