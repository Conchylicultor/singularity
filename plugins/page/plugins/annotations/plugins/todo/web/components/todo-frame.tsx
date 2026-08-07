import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";
import { useTodoTaskState } from "@plugins/page/plugins/annotations/plugins/todo/plugins/task-link/web";

/**
 * The three looks, as whole class strings rather than an interpolated hue: a
 * spliced `` `border-${hue}/40` `` is invisible to Tailwind's scanner, which emits
 * a utility only for literal tokens it can read.
 */
const TINTS = {
  open: "rounded-md border border-dashed border-warning/40 bg-warning/10",
  done: "rounded-md border border-dashed border-success/40 bg-success/10",
  dropped:
    "rounded-md border border-dashed border-muted-foreground/30 bg-muted/40",
} as const;

/**
 * The TODO card's dashed box, covering the card's own (zero-height) anchor row
 * AND every block nested inside it.
 *
 * `ContainerBackdrop` owns the geometry, so this file declares nothing but the
 * look, and the three frame rules (`BlockFrameProps`) hold by construction: the
 * backdrop fills the surface-provided box from `inset` with absolute insets,
 * never `h-full`, and adds no horizontal offset of its own. Semantic theme
 * tokens only, so a preset switch restyles it for free.
 *
 * ## The hue follows the linked task, and stops shouting when it settles
 *
 * **Dashed** is fixed — the annotation family's signature, meta rather than
 * prose. The hue is the family's "outstanding work" `warning` until the card's
 * task says otherwise: `done` repaints it `success`, `dropped` fades it to
 * `muted`. Every other status (including no task at all) is still outstanding
 * work and still warning. So a finished TODO stops competing for attention
 * without disappearing from the page.
 *
 * The status lives beside the row, not in it — a side table keyed by block id
 * joined to the task — which is what `BlockFrameProps.blockId` exists for. A
 * node carrying no id (a forest with no rows behind it) has nothing to look up
 * and paints the static `warning` box.
 *
 * A read-only surface that DOES carry ids (the version-history preview) tints
 * from the card's task as it stands NOW, not as it stood in the snapshot. That
 * is deliberate and not the same lie the prompt block's launch chips would be:
 * the box says what remains to be done about this card, which is a fact about
 * the card today whichever revision of its text you are reading.
 */
export function TodoFrame({ blockId, inset }: BlockFrameProps) {
  if (blockId === undefined)
    return <ContainerBackdrop inset={inset} className={TINTS.open} />;
  return <LinkedTodoFrame blockId={blockId} inset={inset} />;
}

/**
 * The editable-surface arm, split out so the link subscription is a hook on a
 * component that only ever mounts when there is a block id to key it by.
 */
function LinkedTodoFrame({
  blockId,
  inset,
}: {
  blockId: string;
  inset: number;
}) {
  const dispatched = useTodoTaskState(blockId);
  const tint =
    dispatched?.status === "done"
      ? TINTS.done
      : dispatched?.status === "dropped"
        ? TINTS.dropped
        : TINTS.open;

  return <ContainerBackdrop inset={inset} className={tint} />;
}
