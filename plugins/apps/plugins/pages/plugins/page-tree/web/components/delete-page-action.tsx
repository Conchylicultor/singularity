import { useState } from "react";
import { MdDelete } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  pagesResource,
  deleteBlock,
} from "@plugins/page/plugins/editor/core";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Subtree delete is destructive: deleting a page FK-cascades its blocks AND
 * every descendant page. Gate it behind a confirm dialog that names the
 * descendant count.
 */
export function DeletePageAction({
  pageId,
  title,
}: {
  pageId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const result = useResource(pagesResource);
  const { mutateAsync } = useEndpointMutation(deleteBlock);

  const descendantCount = result.pending
    ? 0
    : countDescendants(result.data, pageId);

  const onConfirm = async () => {
    await mutateAsync({ params: { id: pageId } });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Delete page"
        aria-label="Delete page"
        className="hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded"
      >
        <MdDelete className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Delete page</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium">{title || "Untitled"}</span>
            {descendantCount > 0
              ? ` and ${descendantCount} sub-page${
                  descendantCount === 1 ? "" : "s"
                }`
              : ""}
            ? This also removes all of their content and cannot be undone.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
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
