const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

export interface FindScrollParentOptions {
  /** Which axis the caller intends to scroll. Default `"y"`. */
  axis?: "y" | "x";
  /**
   * Also require the candidate to CURRENTLY overflow on `axis` (`scrollHeight >
   * clientHeight`, or the width pair for `"x"`), not merely to be styled
   * scrollable. Default `false`.
   *
   * A consumer that only *reads* a scroll offset (windowing) wants the styled
   * ancestor even while its content happens to fit — it will overflow as rows
   * arrive. A consumer that *drives* the scroll wants the one that can actually
   * move: without this, an edge auto-scroll loop would spin at 60fps against an
   * ancestor whose scrollTop never budges — an absorbed failure, indistinguishable
   * from "the user parked at the bottom".
   */
  requireOverflowing?: boolean;
}

/**
 * Walk up from `el` to the nearest ancestor that scrolls on `axis`.
 *
 * Runtime discovery rather than threading a ref down from whoever owns the
 * scroll: mode-agnostic, so the same call resolves correctly whether the
 * consumer owns its scroll (a surface-mode data-view's own bounded body, an
 * editor mounted in a pane) or is embedded inside a larger scroller (a
 * tabbed-view tab, a detail pane, a demo page) — where the *outer* scroller is
 * the match. Threading a ref would instead force every host to know it is
 * hosting a scroll consumer.
 *
 * Falls back to the document scroller, so a caller is never left with nothing.
 */
export function findScrollParent(
  el: HTMLElement | null,
  opts?: FindScrollParentOptions,
): HTMLElement {
  const axis = opts?.axis ?? "y";
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const overflow = axis === "y" ? style.overflowY : style.overflowX;
    if (SCROLLABLE_OVERFLOW.has(overflow) && (!opts?.requireOverflowing || overflows(node, axis))) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement;
}

/** Does `node` currently have content to scroll on `axis`? */
function overflows(node: HTMLElement, axis: "y" | "x"): boolean {
  return axis === "y"
    ? node.scrollHeight > node.clientHeight
    : node.scrollWidth > node.clientWidth;
}
