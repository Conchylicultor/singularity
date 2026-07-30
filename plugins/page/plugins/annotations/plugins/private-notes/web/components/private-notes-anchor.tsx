import { MdVisibilityOff } from "react-icons/md";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The private-note card's leading glyph — the ONLY thing its row paints.
 *
 * A struck-through eye, and it is the load-bearing half of the card's meaning:
 * the tint only flags the card, the glyph says *withheld*. Fixed, with no
 * appearance sections — the payload is `{}`, so the popover carries only the
 * shared structural actions (Remove private note / Delete).
 */
export function PrivateNotesAnchor({ id, editor }: BlockAnchorProps) {
  return (
    <ContainerAnchor
      id={id}
      editor={editor}
      name="private note"
      triggerLabel="Private note block actions"
      glyph={<MdVisibilityOff className="size-5 text-destructive" />}
    />
  );
}
