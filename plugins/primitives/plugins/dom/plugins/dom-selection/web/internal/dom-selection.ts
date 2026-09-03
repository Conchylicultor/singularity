// The guarded read of the DOCUMENT's selection — `window.getSelection()`, the
// browser's own caret and highlight — as opposed to Lexical's model
// `$getSelection`, which answers about the editor's node tree and can disagree
// with the DOM at any instant. Consumers that hold both in one file (the page
// editor's format toolbar) name them apart line by line; this module is the
// DOM half, and nothing here knows what an editor is.
//
// Nothing runs at import time. In particular there is no `new DOMRect` at
// module eval, so this module imports cleanly in the Node/Bun docgen stub
// context where the browser `DOMRect` global is absent.

/**
 * The live document selection's range, or `null` when there is none to read.
 *
 * This is the one statement of a **three-part** guard, and the reason the
 * primitive exists: four hand-rolled copies of the read existed before it and
 * only one of them had all three parts.
 *
 * 1. There may be no selection object at all.
 * 2. There may be a selection carrying no range (`rangeCount === 0`) — the
 *    ordinary state of a document nobody has clicked into.
 * 3. `getRangeAt(0)` can still throw `IndexSizeError` even after that check
 *    passes: the range is live, and anything that invalidates it between the
 *    count read and the index read (a re-render tearing out the anchor node)
 *    turns the read into an exception. It is the part everyone forgets,
 *    because it never fires while you are testing by hand.
 *
 * The `catch` is narrowed to `DOMException` and rethrows anything else, so this
 * absorbs exactly the one failure it knows how to answer for and stays loud
 * about every other.
 */
export function selectionRange(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    return sel.getRangeAt(0);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return null;
  }
}

/**
 * A rect the layout engine actually painted — the one statement of "a rect with
 * no box is not an anchor".
 *
 * A collapsed caret is zero-WIDE but never zero-tall, so it passes; a range
 * that resolved to nothing paintable (an empty block, or a collapsed caret
 * beside an inline `contenteditable=false` chip) yields an all-zero rect and
 * does not. Callers positioning a surface need that distinction, because an
 * all-zero rect places the surface at the viewport origin rather than at the
 * caret — visibly wrong, and silently so.
 *
 * The previous copies spelled this three ways. Two used `width || height`; the
 * third also required `left` and `top` to be zero, which is the outlier — a
 * rect with a position but no box is still nothing to anchor to. `hasBox` takes
 * the `width || height` form, so it is a deliberate (if practically inert)
 * tightening over that third copy: any rect the outlier rejected, this rejects
 * too, plus the positioned-but-empty ones it let through.
 */
export function hasBox(rect: DOMRect): boolean {
  return rect.width !== 0 || rect.height !== 0;
}

/**
 * The selection's bounding rect, or `null` when there is no selection to read
 * or the range carries no box.
 *
 * The two failure modes collapse into one `null` on purpose: a caller
 * positioning something against the caret has the same answer for both — it
 * has no anchor and must fall back to whatever it considers the containing
 * box. Callers wanting the range for its CONTENT rather than its geometry (a
 * copy handler asking which nodes the user selected) take
 * {@link selectionRange} instead and never reach the rect at all.
 */
export function selectionRect(): DOMRect | null {
  const range = selectionRange();
  if (!range) return null;
  const rect = range.getBoundingClientRect();
  return hasBox(rect) ? rect : null;
}

/**
 * Whether the user currently has **nothing highlighted** — no selection object,
 * no range, or a collapsed one.
 *
 * This is the question a clipboard handler has to ask before it substitutes its
 * own payload for the native copy, and asking Lexical's model `$getSelection()`
 * instead cannot answer it. During a `copy` or `cut`, Lexical does not look at
 * the document at all: `$internalCreateRangeSelection` re-derives the model from
 * the DOM only for an allow-listed event set — `selectionchange`, `beforeinput`,
 * the composition events, a triple `click`, `drop` — and returns
 * `lastSelection.clone()` for everything else. `copy` and `cut` are everything
 * else. So a clipboard handler reads the model as it was last synced, and has no
 * way to recover if that is out of date.
 *
 * It goes out of date whenever a selection gesture's `selectionchange` has not
 * been processed yet — the browser fires it in a LATER task than the keystroke,
 * so under rapid input the model still describes the caret as it was BEFORE the
 * gesture. The damaging shape is a gesture that goes from a caret to a full
 * selection in ONE step (Shift+Home, Shift+End, ⌘A, a drag, a triple-click),
 * because then "stale" means COLLAPSED: the document plainly has a highlight and
 * a handler keying off `isCollapsed()` acts as if the user had selected nothing.
 * Only the FIRST step of a gesture has that shape — from the second Shift+Arrow
 * on, the model is merely one character behind rather than collapsed, which is
 * why the defect this was written for read as a whole-selection-only one.
 *
 * The document's own selection has neither problem: it IS what the native copy
 * is about to act on, which is exactly what the handler needs to know.
 */
export function selectionIsCollapsed(): boolean {
  const range = selectionRange();
  return range === null || range.collapsed;
}
