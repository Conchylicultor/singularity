import { MdAutoAwesome } from "react-icons/md";
import type { BlockAnchorProps } from "@plugins/page/plugins/editor/web";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The agent-notes card's leading glyph — the ONLY thing its row paints.
 *
 * A FIXED glyph and no appearance sections: the card's payload is `{}`, so there
 * is nothing per-instance to configure and its popover carries only the shared
 * structural actions (Remove agent notes / Delete).
 *
 * The static-vs-interactive branch, the trigger and the popover all belong to
 * `ContainerAnchor`; `data` is deliberately unread.
 */
export function AgentNotesAnchor({ id, editor }: BlockAnchorProps) {
  return (
    <ContainerAnchor
      id={id}
      editor={editor}
      name="agent notes"
      triggerLabel="Agent notes block actions"
      glyph={<MdAutoAwesome className="size-5 text-info" />}
    />
  );
}
