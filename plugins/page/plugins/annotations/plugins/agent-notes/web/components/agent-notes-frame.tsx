import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The agent-notes card's wash, covering the card's own (zero-height) anchor row
 * AND every block nested inside it.
 *
 * `ContainerBackdrop` owns the geometry, so this file declares nothing but the
 * look: a soft tint in the `info` hue (the family's "an agent is telling you
 * something" direction — see `page/annotations/CLAUDE.md`), with no border and
 * no icon. Semantic theme tokens only, so a preset switch restyles it for free.
 * The block's `data` is never read — this card has no per-instance appearance.
 */
export function AgentNotesFrame(props: BlockFrameProps) {
  return <ContainerBackdrop frame={props} className="rounded-md bg-info/10" />;
}
