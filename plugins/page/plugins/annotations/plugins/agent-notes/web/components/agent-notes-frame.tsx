import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The agent-notes card's dashed box, covering the card's own (zero-height)
 * anchor row AND every block nested inside it.
 *
 * `ContainerBackdrop` owns the geometry, so this file declares nothing but the
 * look: **dashed** (the annotation family's signature — meta, not prose, unlike
 * a callout's solid tint) in the `info` hue (the family's "an agent is telling
 * you something" direction — see `page/annotations/CLAUDE.md`). Semantic theme
 * tokens only, so a preset switch restyles it for free. The block's `data` is
 * never read — this card has no per-instance appearance.
 */
export function AgentNotesFrame({ inset }: BlockFrameProps) {
  return (
    <ContainerBackdrop
      inset={inset}
      className="rounded-md border border-dashed border-info/40 bg-info/10"
    />
  );
}
