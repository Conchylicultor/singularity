import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The human card's wash, covering the card's own (zero-height) anchor row AND
 * every block nested inside it — a human card is a CONTAINER: it supplies the
 * box, the blocks within supply the author's own words, and they may be of any
 * type.
 *
 * `ContainerBackdrop` owns the geometry (the box the surface measured, handed
 * over whole — the card's own content box, so its edge lands on the same x as
 * the prose above it), so this file declares nothing but the look.
 *
 * A soft tint and NOTHING else: no border, no icon. What separates this from a
 * callout is no longer a dashed edge but the fact that a callout is DRAWN (an
 * icon its author chose) while an annotation is NAMED — and the name appears
 * only when the pointer is inside the card. The hue is the whole resting signal,
 * and `muted` is the family's neutral for a reason that survived the rename: this
 * card is the page's OWN voice, and every other semantic hue would attach a
 * status to it. It also has to stay legible nested inside `agent-note`'s
 * `bg-info/10`, which is now an ordinary arrangement rather than an odd one — a
 * human answering an agent inside its own card. The block's `data` is never read:
 * a human card has no per-instance appearance.
 */
export function HumanNotesFrame(props: BlockFrameProps) {
  return <ContainerBackdrop frame={props} className="rounded-md bg-muted/50" />;
}
