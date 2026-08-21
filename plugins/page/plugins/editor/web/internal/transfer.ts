/** Custom clipboard MIME carrying a serialized block forest (round-trips full
 *  structure); `text/plain` carries a markdown fallback for external apps. */
export const BLOCKS_MIME = "application/x-singularity-blocks+json";

/**
 * The text a `DataTransfer` carries, read with the SAME fallback Lexical's own
 * plain-text arm uses: `text/plain`, else `text/uri-list`
 * (`$insertDataTransferForRichText` → `@lexical/clipboard@0.44.0
 * LexicalClipboard.dev.mjs:121`).
 *
 * One helper so the two cannot drift. A transfer carrying ONLY `text/uri-list`
 * — a link dragged out of another browser tab, and some apps' copied links — is
 * invisible to a bare `getData("text/plain")`, so a classifier reading that
 * alone declines and hands the payload straight to the arm below it, which then
 * reads the URI list after all. Every classification of a transfer in this
 * plugin therefore goes through here.
 */
export function readTransferText(data: DataTransfer): string {
  return data.getData("text/plain") || data.getData("text/uri-list");
}

/**
 * The four ways a `DataTransfer` entering the page can resolve, decided purely
 * from its shape. Shared by every door — the block-selection-mode container
 * paste, the per-block caret paste, and the container's pointer DROP — so the
 * surfaces branch identically:
 *  - `file`     — a FILE; the attachment path owns it.
 *  - `forest`   — a `BLOCKS_MIME` payload (a copied block forest) to JSON.parse.
 *  - `markdown` — text to parse into a block forest.
 *  - `inline`   — a single line landing at an insertion point; leave the native
 *                 inline paste/drop alone.
 */
export type TransferDecision =
  | { kind: "file" }
  | { kind: "forest"; json: string }
  | { kind: "markdown"; text: string }
  | { kind: "inline" };

/**
 * Classify a transfer from its primitive fields.
 *
 * > A `DataTransfer` entering the page lands as BLOCKS unless it is a single
 * > line AND there is an inline insertion point that can absorb it.
 *
 * A file wins outright; a block-forest payload beats text; text claims the
 * gesture as markdown unless both halves of the inline rule hold.
 *
 * `inline` is the caller's answer to *"is there an insertion point a single line
 * can land in?"* — true for a caret-in-block paste and for a drop whose target
 * sits inside a block's editing host, false for the block-selection-mode
 * container paste (which deliberately holds no caret) and for a drop over the
 * page's non-editable area. Empty text with `inline: false` therefore yields
 * `markdown`: every call site already declines on an empty parsed forest, so
 * that is the single place emptiness is handled.
 */
export function decideTransfer(opts: {
  isFile: boolean;
  blocksJson: string;
  text: string;
  inline: boolean;
}): TransferDecision {
  if (opts.isFile) return { kind: "file" };
  if (opts.blocksJson) return { kind: "forest", json: opts.blocksJson };
  if (opts.inline && !opts.text.includes("\n")) return { kind: "inline" };
  return { kind: "markdown", text: opts.text };
}
