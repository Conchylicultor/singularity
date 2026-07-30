import { MdPendingActions } from "react-icons/md";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The TODO card's leading glyph — the ONLY thing its row paints.
 *
 * A FIXED glyph with no appearance sections: the payload is `{}`, so the popover
 * carries only the shared structural actions (Remove TODO / Delete).
 */
export function TodoAnchor({ id, editor }: BlockAnchorProps) {
  return (
    <ContainerAnchor
      id={id}
      editor={editor}
      name="TODO"
      triggerLabel="TODO block actions"
      glyph={<MdPendingActions className="size-5 text-warning" />}
    />
  );
}
