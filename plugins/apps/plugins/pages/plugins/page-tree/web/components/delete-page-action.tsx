import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { MdDelete } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
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
        // eslint-disable-next-line layout/no-adhoc-layout -- rigid edge button in the data-view row-actions flex cluster (externally owned)
        className="hover:bg-background/60 size-6 shrink-0 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Center className="size-full">
          <MdDelete className="size-4" />
        </Center>
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
          <Stack
            direction="row"
            justify="end"
            gap="sm"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- action row offset below the dialog description; one-off dialog footer spacing
            className="mt-4"
          >
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => onConfirm()}>
              Delete
            </Button>
          </Stack>
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
