import {
  serializeForestToMarkdown,
  type BlockHandle,
  type IdentifiedBlock,
} from "../../core";
import { blockTextProtectedSpans } from "./block-text-extensions";
import { BLOCKS_MIME } from "./transfer";

/**
 * THE encoding of a copied block forest onto the clipboard — the exact inverse
 * of `decideTransfer`'s `forest` arm (`./transfer.ts`), which is why it lives
 * beside it rather than inside either caller.
 *
 * Two flavors, always both:
 *  - `BLOCKS_MIME` — the structural payload, so a paste back into a page
 *    round-trips the whole subtree (types, nesting, data) rather than its text.
 *  - `text/plain` — the markdown projection, so the copy is worth something in
 *    any other app.
 *
 * Kept out of `./clipboard.ts` deliberately: that module is pure enough to be
 * unit-tested with no Lexical in the loader (`clipboard.test.ts`), and the
 * protected-span registry read below pulls the whole block-text extension set in.
 *
 * Both surfaces that copy blocks call it — the block-selection container
 * (`block-editor.tsx`) and the collapsed-caret copy inside one block
 * (`block-forest-copy-plugin.tsx`) — so the two produce byte-identical
 * clipboard payloads by construction, not by two mirrored implementations
 * happening to agree.
 */
export function writeForestToClipboard(
  clipboardData: DataTransfer,
  forest: IdentifiedBlock[],
  handles: BlockHandle<unknown>[],
): void {
  clipboardData.setData(BLOCKS_MIME, JSON.stringify(forest));
  clipboardData.setData(
    "text/plain",
    serializeForestToMarkdown(forest, {
      handles,
      protectedSpans: blockTextProtectedSpans(),
      // Serialize ignores the dialect — there is one emitted form — but this is
      // the text that names it: what we put on the clipboard writes an empty
      // paragraph as a blank line.
      blankLines: "empty-block",
      // A human pasting this into another app must never see a tag. The internal
      // copy/paste round trip goes through the structural `BLOCKS_MIME` flavour
      // above, so nothing that matters is lost by spelling every empty paragraph
      // as a blank line here.
      emptyBlocks: "blank-line",
    }),
  );
}
