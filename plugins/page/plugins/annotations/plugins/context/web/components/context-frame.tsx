import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The context card's dashed box, covering the card's own (zero-height) anchor row
 * AND every block nested inside it — a context card is a CONTAINER: it supplies
 * the box, the blocks within supply the instructions, and they may be of any
 * type.
 *
 * `ContainerBackdrop` owns the geometry (an `absolute` box filling the
 * surface-provided positioned box from `inset`, never `h-full`, no horizontal
 * offset of its own), so this file declares nothing but the look.
 *
 * The DASHED border is the whole visual argument, and what distinguishes it from
 * a callout's solid tint: this is meta, addressed to an agent, not prose
 * addressed to the reader. The block's `data` is never read — a context card has
 * no per-instance appearance to read.
 */
export function ContextFrame({ inset }: BlockFrameProps) {
  return (
    <ContainerBackdrop
      inset={inset}
      className="rounded-md border border-dashed border-border bg-muted/40"
    />
  );
}
