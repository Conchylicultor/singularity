import { ContainerCornerLabel } from "@plugins/page/plugins/container/web";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";

/**
 * The private-note card's name, in the top-right corner of its box — the ONLY
 * thing its row paints, and a plain, non-interactive answer on BOTH surfaces.
 *
 * The name is the load-bearing half of the card's meaning, as the struck-through
 * eye was before it: the tint only flags the card, the word says *withheld*. It
 * is the one card in the family whose name genuinely tells the reader something
 * the hue cannot, which is the argument for the word over the icon rather than
 * against showing anything at all.
 *
 * No appearance `sections` — the payload is `{}`, so there is nothing
 * per-instance to configure and nothing for a popover to open onto. Structural
 * actions (Collapse / Remove private note / Delete) come from the rail on the
 * line it borrows, generically over `BlockHandle.anchor`.
 */
export function PrivateNotesAnchor({ blockId }: BlockAnchorProps) {
  return (
    <ContainerCornerLabel
      blockId={blockId}
      name="Private"
      className="text-destructive/80"
    />
  );
}
