import { MdPendingActions } from "react-icons/md";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The TODO card's leading glyph — the ONLY thing its row paints, and a plain,
 * non-interactive mark on BOTH surfaces.
 *
 * A FIXED glyph with no appearance `sections`: the payload is `{}`, so there is
 * nothing per-instance to configure and nothing for a popover to open onto. Its
 * structural actions (Collapse / Remove TODO / Delete) come from the rail on the
 * line it borrows, generically over `BlockHandle.anchor`.
 *
 * It therefore takes NO props at all — `BlockAnchorProps`' `data`/`editor` have
 * nothing here to feed — which a `ComponentType<BlockAnchorProps>` slot accepts
 * as the degenerate case rather than requiring a stub signature.
 */
export function TodoAnchor() {
  return <ContainerAnchor glyph={<MdPendingActions className="size-5 text-warning" />} />;
}
