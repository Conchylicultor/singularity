import { MdRule } from "react-icons/md";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The context card's leading glyph — the ONLY thing its row paints.
 *
 * A FIXED glyph, and no appearance sections: the card's payload is `{}`, so
 * there is nothing per-instance to configure and its popover carries only the
 * shared structural actions (Remove context / Delete). That is the point of the
 * void model — a container with no appearance declares no appearance, rather
 * than inheriting a picker it has no field to write to.
 *
 * The static-vs-interactive branch, the trigger and the popover all belong to
 * `ContainerAnchor`; `data` is deliberately unread.
 */
export function ContextAnchor({ id, editor }: BlockAnchorProps) {
  return (
    <ContainerAnchor
      id={id}
      editor={editor}
      name="context"
      triggerLabel="Context block actions"
      glyph={<MdRule className="size-5 text-muted-foreground" />}
    />
  );
}
