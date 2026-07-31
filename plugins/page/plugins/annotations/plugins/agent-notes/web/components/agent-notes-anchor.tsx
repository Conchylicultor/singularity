import { MdAutoAwesome } from "react-icons/md";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The agent-notes card's leading glyph — the ONLY thing its row paints, and a
 * plain, non-interactive mark on BOTH surfaces.
 *
 * A FIXED glyph and no appearance `sections`: the card's payload is `{}`, so
 * there is nothing per-instance to configure — and with nothing to configure
 * there is nothing for a popover to open onto. It loses nothing by that: its
 * structural actions (Collapse / Remove agent notes / Delete) come from the rail
 * on the line it borrows, generically over `BlockHandle.anchor`.
 *
 * It therefore takes NO props at all — `BlockAnchorProps`' `data`/`editor` have
 * nothing here to feed — which a `ComponentType<BlockAnchorProps>` slot accepts
 * as the degenerate case rather than requiring a stub signature.
 */
export function AgentNotesAnchor() {
  return <ContainerAnchor glyph={<MdAutoAwesome className="size-5 text-info" />} />;
}
