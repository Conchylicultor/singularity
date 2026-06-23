import { useEffect, useRef } from "react";

const SCROLLABLE = new Set(["auto", "scroll", "overlay"]);

/**
 * Dev-only structural guard for `<DataView>`. A DataView is always
 * natural-height and never owns a scroller, so its enclosing pane must provide
 * exactly one scroll (a `<PaneScroll>`). After layout settles, this finds the
 * nearest ancestor the content *vertically overflows* and asserts it is
 * scrollable; if instead that ancestor clips (`overflow-y: hidden/visible`) the
 * pane forgot its `<PaneScroll>` and the view is unscrollable (overscroll-hint
 * bounces instead). Fails loud but non-fatal (`console.error`, never throws).
 *
 * Checking the first *vertically-overflowing* ancestor (not merely the first
 * `overflow-y:auto` one) is deliberate: a Miller layout's horizontal column
 * strip is `overflow-x:auto`, which forces computed `overflow-y:auto` even
 * though it never scrolls vertically — a naive overflow-style walk green-lights
 * it falsely. Anchoring on actual vertical overflow stops at the real culprit
 * (the clipping column) and ignores the horizontal strip. It also can't
 * false-positive: with no vertical overflow yet (content still loading) there is
 * simply nothing to flag.
 *
 * Lives in its own hook (not inline in the component) so the effect's ref read +
 * DOM walk stay out of the DataView component's React Compiler analysis — an
 * inline effect reading `ref.current` extends a mutable range that makes the
 * compiler skip optimizing the whole component (breaking its manual memos).
 *
 * Returns the ref to attach to the DataView root element.
 */
export function useScrollAncestorGuard(label: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const root = ref.current;
    if (!root) return;
    // One frame for layout to settle before measuring overflow.
    const raf = requestAnimationFrame(() => {
      let node = root.parentElement;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 1) {
          // First ancestor the content vertically overflows decides.
          if (!SCROLLABLE.has(getComputedStyle(node).overflowY)) {
            console.error(
              `[DataView ${label}] content overflows a non-scrolling ancestor — the pane must provide a <PaneScroll>`,
            );
          }
          return;
        }
        node = node.parentElement;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [label]);
  return ref;
}
