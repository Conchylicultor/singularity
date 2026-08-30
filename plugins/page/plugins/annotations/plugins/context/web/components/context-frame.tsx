import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The context card's wash, covering the card's own (zero-height) anchor row AND
 * every block nested inside it — a context card is a CONTAINER: it supplies the
 * box, the blocks within supply the instructions, and they may be of any type.
 *
 * `ContainerBackdrop` owns the geometry (the box the surface measured, handed
 * over whole — the card's own content box, so its edge lands on the same x as
 * the prose above it), so this file declares nothing but the look.
 *
 * A soft tint and NOTHING else: no border, no icon. What separates this from a
 * callout is no longer a dashed edge but the fact that a callout is DRAWN (an
 * icon its author chose) while an annotation is NAMED — and the name appears
 * only when the pointer is inside the card. The hue is the whole resting signal,
 * `muted` being the family's neutral: the background the agent works against.
 * The block's `data` is never read — a context card has no per-instance
 * appearance.
 */
export function ContextFrame(props: BlockFrameProps) {
  return <ContainerBackdrop frame={props} className="rounded-md bg-muted/50" />;
}
