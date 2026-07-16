/** Custom clipboard MIME carrying a serialized block forest (round-trips full
 *  structure); `text/plain` carries a markdown fallback for external apps. */
export const BLOCKS_MIME = "application/x-singularity-blocks+json";

/**
 * The four ways a paste can resolve, decided purely from the clipboard's shape.
 * Shared by the block-selection-mode container paste and the per-block caret
 * paste so both surfaces branch identically:
 *  - `defer`    — a pasted FILE; the attachment paste handler owns it.
 *  - `forest`   — a `BLOCKS_MIME` payload (a copied block forest) to JSON.parse.
 *  - `markdown` — multi-line `text/plain` to parse into a block forest.
 *  - `default`  — single-line / empty text; leave the native inline paste alone.
 */
export type PasteDecision =
  | { kind: "defer" }
  | { kind: "forest"; json: string }
  | { kind: "markdown"; text: string }
  | { kind: "default" };

/**
 * Classify a paste from its primitive clipboard fields. A file wins outright; a
 * block-forest payload beats plain text; plain text only claims the paste when it
 * spans multiple lines (a single line stays a native inline paste).
 */
export function decidePaste(opts: {
  isFile: boolean;
  blocksJson: string;
  plainText: string;
}): PasteDecision {
  if (opts.isFile) return { kind: "defer" };
  if (opts.blocksJson) return { kind: "forest", json: opts.blocksJson };
  if (opts.plainText.includes("\n")) return { kind: "markdown", text: opts.plainText };
  return { kind: "default" };
}
