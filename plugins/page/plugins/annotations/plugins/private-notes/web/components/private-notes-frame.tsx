import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The private-note card's wash, covering the card's own (zero-height)
 * anchor row AND every block nested inside it.
 *
 * `ContainerBackdrop` owns the geometry, so this file declares nothing but the
 * look: a soft wash in the `destructive` hue at deliberately LOW alpha, no
 * border and no icon. It has to read as *restricted*, not as *error* — this is
 * the user's own note, not a failure — so the tint only flags it and the card's
 * name, which appears when the pointer is inside it, carries the meaning.
 *
 * The alpha is lifted a step from the bordered version: with no edge to hold it
 * together, a `/5` wash read as a smudge rather than a box.
 */
export function PrivateNotesFrame(props: BlockFrameProps) {
  return (
    <ContainerBackdrop frame={props} className="rounded-md bg-destructive/10" />
  );
}
