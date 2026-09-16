import {
  newBlockId,
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
 *
 * `gesture` is what a paste of a sub-page later hinges on: a CUT stamps one
 * fresh `cutId` on every page node, so the first paste of it moves those pages
 * (keeping their ids) while a copy — or any later paste of the same cut —
 * copies them. See `PageSource` in `core/serialized-block.ts`.
 */
export function writeForestToClipboard(
  clipboardData: DataTransfer,
  forest: IdentifiedBlock[],
  handles: BlockHandle<unknown>[],
  gesture: "copy" | "cut",
): void {
  const payload = gesture === "cut" ? withCutId(forest, newBlockId()) : forest;
  clipboardData.setData(BLOCKS_MIME, JSON.stringify(payload));
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
      // A human pasting into a plain-text field must see a real line break, not
      // the two characters `\n`. Same trade as the line above, and the internal
      // round trip goes through `BLOCKS_MIME`, so nothing that matters is lost.
      softBreaks: "newline",
    }),
  );
}

/** Stamp one cut gesture's id on every page node of a copied forest. */
function withCutId(
  forest: IdentifiedBlock[],
  cutId: string,
): IdentifiedBlock[] {
  return forest.map((node) => ({
    ...node,
    ...(node.pageSource ? { pageSource: { ...node.pageSource, cutId } } : {}),
    children: withCutId(node.children, cutId),
  }));
}
