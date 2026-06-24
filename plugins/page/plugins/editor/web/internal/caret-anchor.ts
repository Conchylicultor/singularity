// A LIVE virtual element anchored to the document selection's caret rect, for the
// `FloatingSurface` primitive. Every floating caret menu in the editor (`/`, `$$`,
// `@`, `[[`, URL paste) reads the caret the same way — through
// `window.getSelection()?.getRangeAt(0).getBoundingClientRect()` — so this is the
// single shared source of that virtual anchor.
//
// It returns a virtual element whose `getBoundingClientRect` RE-READS the live
// selection on every call, so scroll-follow is exact (the rect is never captured
// once and left stale). When the live rect is absent or all-zero (a collapsed
// caret in an EMPTY block yields an all-zero rect — the url-paste case), it defers
// to the caller's `fallback` (e.g. the block's editable element rect).

/** The live caret rect, or `null` when there's no usable selection range. */
function liveCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let rect: DOMRect;
  try {
    rect = sel.getRangeAt(0).getBoundingClientRect();
  } catch (err) {
    // `getRangeAt(0)` throws an IndexSizeError (DOMException) if the range was
    // invalidated between the rangeCount check and the read; treat that as "no
    // rect". Anything else is unexpected — rethrow it loudly.
    if (!(err instanceof DOMException)) throw err;
    return null;
  }
  // An all-zero rect (collapsed caret in an empty block) is not a usable anchor.
  if (!rect.width && !rect.height && !rect.left && !rect.top) return null;
  return rect;
}

/**
 * A live virtual anchor for `FloatingSurface`, tracking the document selection's
 * caret rect. Pass `fallback` to supply a rect when the live caret rect is absent
 * or all-zero (the empty-block paste case). Returns `null` at call time only when
 * there is no live selection AND no fallback — otherwise a virtual element whose
 * `getBoundingClientRect` re-reads the selection on every call.
 */
export function caretAnchor(
  fallback?: () => DOMRect | null,
): { getBoundingClientRect: () => DOMRect } | null {
  if (!liveCaretRect() && !fallback) return null;
  return {
    // `new DOMRect` is constructed lazily here (never at module-eval time) so this
    // module imports cleanly in the Node/Bun docgen stub context, where the browser
    // `DOMRect` global is absent.
    getBoundingClientRect: () => liveCaretRect() ?? fallback?.() ?? new DOMRect(0, 0, 0, 0),
  };
}
