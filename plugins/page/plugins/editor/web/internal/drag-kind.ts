import { BLOCKS_MIME } from "./transfer";

/**
 * What a drag carries, as far as a `dragover` can know.
 *
 * During a drag the browser puts the `DataTransfer` in PROTECTED mode: `types`
 * is readable but `getData()` returns `""` for every one of them. So the only
 * decision available while the pointer is still moving is this one — the
 * knowable-during-dragover subset of {@link decideTransfer}. It deliberately
 * cannot tell a single line of text from a multi-line one (that needs the bytes,
 * which arrive only on `drop`), so `"text"` means *some* text, and the full
 * decision is `decideTransfer` at drop time.
 */
export type DragKind = "files" | "forest" | "text" | "none";

/**
 * A drag the container actually CLAIMS — every `DragKind` but the refusal.
 *
 * The refusal is answered and consumed at the door (`dragKindFromTypes` →
 * `"none"` → return), so nothing downstream of it can be holding one. Saying so
 * in the type is what deletes the defensive `kind === "none"` branch from every
 * consumer.
 */
export type ClaimedKind = Exclude<DragKind, "none">;

/**
 * Lexical's own drag marker, written by `$writeDragSourceToDataTransfer` on
 * `DRAGSTART` (`@lexical/clipboard@0.44.0 LexicalClipboard.dev.mjs:194,211`).
 * A transfer carrying it is the editor MOVING its own nodes — Lexical's
 * `$handleRichTextDrop` matches the source editor and range and removes it, i.e.
 * cut-and-paste semantics we would silently turn into a copy.
 */
const LEXICAL_DRAG_MIME = "application/x-lexical-drag";

/**
 * Classify a drag from its `DataTransfer.types` alone.
 *
 * Priority mirrors {@link decideTransfer}: files beat a block forest, which
 * beats text. A Lexical-marked drag is refused OUTRIGHT (`"none"`) ahead of
 * everything, marker first: it also carries `text/plain` and `text/html`, so any
 * later rung would claim it and hand a MOVE of the editor's own nodes to a
 * classifier that only knows how to copy.
 */
export function dragKindFromTypes(types: readonly string[]): DragKind {
  if (types.includes(LEXICAL_DRAG_MIME)) return "none";
  if (types.includes("Files")) return "files";
  if (types.includes(BLOCKS_MIME)) return "forest";
  if (types.includes("text/plain") || types.includes("text/uri-list")) {
    return "text";
  }
  return "none";
}
