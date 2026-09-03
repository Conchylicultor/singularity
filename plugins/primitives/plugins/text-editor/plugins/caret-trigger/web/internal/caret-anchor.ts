// The LIVE virtual element this primitive hands `FloatingSurface`'s `anchor` prop:
// it adapts the document selection's caret rect into the shape Floating UI wants.
// The rect READ itself is not ours — `primitives/dom/dom-selection` owns that, and its
// three-part guard (no selection → `rangeCount === 0` → `getRangeAt` throwing
// `IndexSizeError`) is stated once there.
//
// This is plugin-private on purpose. It has exactly one consumer,
// `CaretTriggerMenu`, so it is not promoted into `dom-selection`: a live virtual
// element for one primitive's `anchor` prop is the abstraction to build when a
// SECOND consumer appears, not before.

import { selectionRect } from "@plugins/primitives/plugins/dom/plugins/dom-selection/web";

/**
 * A live virtual anchor for `FloatingSurface`, tracking the document selection's
 * caret rect. Pass `fallback` to supply a rect when the live caret rect is absent
 * or carries no box (the empty-block paste case — a collapsed caret in an EMPTY
 * block paints nothing). Returns `null` at call time only when there is no live
 * selection AND no fallback — otherwise a virtual element whose
 * `getBoundingClientRect` RE-READS the selection on every call, so scroll-follow
 * is exact and the rect is never captured once and left stale.
 */
export function caretAnchor(
  fallback?: () => DOMRect | null,
): { getBoundingClientRect: () => DOMRect } | null {
  if (!selectionRect() && !fallback) return null;
  return {
    // `new DOMRect` is constructed lazily here (never at module-eval time) so this
    // module imports cleanly in the Node/Bun docgen stub context, where the browser
    // `DOMRect` global is absent.
    getBoundingClientRect: () =>
      selectionRect() ?? fallback?.() ?? new DOMRect(0, 0, 0, 0),
  };
}
