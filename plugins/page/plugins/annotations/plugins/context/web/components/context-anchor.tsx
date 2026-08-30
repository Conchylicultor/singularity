import { ContainerCornerLabel } from "@plugins/page/plugins/container/web";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";

/**
 * The context card's name, in the top-right corner of its box — the ONLY thing
 * its row paints, and a plain, non-interactive answer on BOTH surfaces.
 *
 * It used to be a glyph in the margin (`MdRule`), permanently. The icon is not
 * gone — it still names the card in the slash menu and the turn-into list, off
 * the handle — it has just left the card, where it was paying a fixed price on
 * every context card for a fact the tint already carries. What is left appears
 * only when the pointer is inside the box, and says the one thing the hue
 * cannot: which of the four this is.
 *
 * The card's payload is `{}`, so there is nothing per-instance to configure and
 * it contributes no appearance `sections` — no popover, no action, just the
 * name. Its structural actions (Collapse / Remove context / Delete) come from
 * the rail on the line it borrows, generically, like every other container's.
 */
export function ContextAnchor({ blockId }: BlockAnchorProps) {
  return (
    <ContainerCornerLabel
      blockId={blockId}
      name="Context"
      className="text-muted-foreground"
    />
  );
}
