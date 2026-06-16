import { BlockTextRenderer, type BlockRendererProps } from "@plugins/page/plugins/editor/web";

/**
 * Quote block renderer. A blockquote is just an editable-text block wearing a
 * left border and italic emphasis, so it composes the shared `BlockTextRenderer`
 * (which owns the whole Lexical pipeline, the slash menu, markdown shortcuts and
 * structural keyboard handling) inside a styled container — no quote-specific
 * editing logic. Converting to/from a quote reconciles in place because the
 * inner renderer is the same component every text block uses.
 */
export function QuoteBlock(props: BlockRendererProps) {
  return (
    // Border + emphasis only — the shared block text rail owns the left text
    // inset, so the quote text aligns with every other block instead of being
    // double-indented by an extra `pl-md` here.
    <div className="border-l-2 border-muted-foreground/30 italic">
      <BlockTextRenderer {...props} />
    </div>
  );
}
