import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The private-note card's dashed box, covering the card's own (zero-height)
 * anchor row AND every block nested inside it.
 *
 * `ContainerBackdrop` owns the geometry, so this file declares nothing but the
 * look: **dashed** (the annotation family's signature — meta, not prose) in the
 * `destructive` hue at deliberately LOW alpha. It has to read as *restricted*,
 * not as *error*: this is the user's own note, not a failure, so the tint is a
 * flag and the anchor's struck-through eye carries the meaning.
 */
export function PrivateNotesFrame({ inset }: BlockFrameProps) {
  return (
    <ContainerBackdrop
      inset={inset}
      className="rounded-md border border-dashed border-destructive/30 bg-destructive/5"
    />
  );
}
