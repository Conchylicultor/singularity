import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { ContainerBackdrop } from "@plugins/page/plugins/container/web";

/**
 * The instructions card's wash, covering its own (zero-height) anchor row and
 * every block nested inside it. `ContainerBackdrop` owns the geometry, so this
 * file declares only the look.
 *
 * `primary` at low alpha, the one semantic hue the family had not used: `muted`
 * is `/human`'s voice, `info` the agent's, `warning`/`success` a TODO's status,
 * `destructive` the private card. Standing instructions are none of those — they
 * are the rules the page's agents work by, and the same wash tints an
 * instructions PAGE's row in its parent and the sidebar, so the two forms read as
 * one thing.
 */
export function InstructionsFrame(props: BlockFrameProps) {
  return (
    <ContainerBackdrop frame={props} className="rounded-md bg-primary/10" />
  );
}
