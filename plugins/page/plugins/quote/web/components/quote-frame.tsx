import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The quote's left bar, covering the quote's own (zero-height) anchor row AND
 * every block nested inside it — a quote is a CONTAINER: it supplies the bar, the
 * blocks within supply the passage, and they may be of any type.
 *
 * The bar being the FRAME rather than a per-line border is the whole point of
 * the container model. A text block's border is one line tall, so a two-paragraph
 * quotation drew two bars with a seam between them; a frame spans `start..end`
 * grid lines, so one unbroken bar runs the height of the passage however many
 * blocks it holds.
 *
 * `ContainerBackdrop` owns the geometry (an `absolute` box filling the
 * surface-provided positioned box from `inset`, never `h-full`, no horizontal
 * offset of its own), so this file declares nothing but the look. The block's
 * `data` is never read — a quote has no per-instance appearance.
 *
 * No tint and no border box: a quote is the LIGHTEST container in the family
 * (the callout is a solid fill, the annotation cards are dashed boxes), and its
 * one identifying mark is the rule down its left edge.
 */
export function QuoteFrame({ inset }: BlockFrameProps) {
  return <ContainerBackdrop inset={inset} className="border-muted-foreground/30 border-l-2" />;
}
