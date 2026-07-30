import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The TODO card's dashed box, covering the card's own (zero-height) anchor row
 * AND every block nested inside it.
 *
 * `ContainerBackdrop` owns the geometry, so this file declares nothing but the
 * look: **dashed** (the annotation family's signature — meta, not prose) in the
 * `warning` hue (the family's "outstanding work" direction — see
 * `page/annotations/CLAUDE.md`). Semantic theme tokens only, so a preset switch
 * restyles it for free.
 */
export function TodoFrame({ inset }: BlockFrameProps) {
  return (
    <ContainerBackdrop
      inset={inset}
      className="rounded-md border border-dashed border-warning/40 bg-warning/10"
    />
  );
}
