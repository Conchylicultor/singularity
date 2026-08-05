import { MdFormatQuote } from "react-icons/md";
import { ContainerAnchor } from "@plugins/page/plugins/container/web";

/**
 * The quote's leading glyph — the only thing its row paints, and a plain,
 * non-interactive mark on BOTH surfaces.
 *
 * The payload is `{}`, so there is nothing per-instance to configure and it
 * contributes no appearance `sections` — which means no popover at all. That is
 * the point of the void model: a container with nothing to configure declares
 * nothing rather than inheriting a picker it has no field to write to, and its
 * structural actions (Collapse / Remove quote / Delete) come from the rail on the
 * line it borrows, generically, like every other container's.
 *
 * It therefore takes NO props at all — `BlockAnchorProps`' `data`/`editor` have
 * nothing here to feed — which a `ComponentType<BlockAnchorProps>` slot accepts
 * as the degenerate case rather than requiring a stub signature.
 */
export function QuoteAnchor() {
  return (
    <ContainerAnchor glyph={<MdFormatQuote className="text-muted-foreground/50 size-4" />} />
  );
}
