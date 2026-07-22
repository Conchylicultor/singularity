export type ScrollAlign = "start" | "center" | "end" | "nearest";

export interface ScrollChildIntoViewOptions {
  /** Vertical alignment of the child within the container. Omit to leave the
   *  vertical scroll position untouched. */
  block?: ScrollAlign;
  /** Horizontal alignment. Omit to leave the horizontal scroll position alone. */
  inline?: ScrollAlign;
  behavior?: ScrollBehavior;
}

function alignTarget(
  currentScroll: number,
  childStart: number,
  childSize: number,
  viewSize: number,
  align: ScrollAlign,
): number {
  switch (align) {
    case "start":
      return childStart;
    case "center":
      return childStart - (viewSize - childSize) / 2;
    case "end":
      return childStart - (viewSize - childSize);
    case "nearest": {
      const childEnd = childStart + childSize;
      const viewEnd = currentScroll + viewSize;
      if (childStart < currentScroll) return childStart;
      if (childEnd > viewEnd) return childEnd - viewSize;
      return currentScroll;
    }
  }
}

/**
 * Scroll ONLY `container` so `child` is aligned within it — never touching any
 * ancestor's scroll position. The container-scoped counterpart to scroll-reveal's
 * `revealElement`, which uses `scrollIntoView` and therefore scrolls every
 * scrollable ancestor up the chain to bring the element on screen. Use this when
 * a single bounded surface must follow its own content while everything around it
 * stays put (e.g. a self-scrolling lead-sheet strip nested inside a scrollable
 * pane).
 *
 * Only the axes you pass move: pass `block` to scroll vertically, `inline` to
 * scroll horizontally; omit an axis to leave that scroll offset untouched.
 * Rect-based (not offsetTop), so it is independent of the child's offsetParent.
 */
export function scrollChildIntoView(
  container: HTMLElement | null | undefined,
  child: HTMLElement | null | undefined,
  opts?: ScrollChildIntoViewOptions,
): void {
  if (!container || !child) return;
  const cRect = container.getBoundingClientRect();
  const chRect = child.getBoundingClientRect();
  const to: ScrollToOptions = { behavior: opts?.behavior ?? "auto" };

  if (opts?.block) {
    const childTop = container.scrollTop + (chRect.top - cRect.top);
    const raw = alignTarget(
      container.scrollTop,
      childTop,
      chRect.height,
      container.clientHeight,
      opts.block,
    );
    to.top = Math.max(
      0,
      Math.min(raw, container.scrollHeight - container.clientHeight),
    );
  }
  if (opts?.inline) {
    const childLeft = container.scrollLeft + (chRect.left - cRect.left);
    const raw = alignTarget(
      container.scrollLeft,
      childLeft,
      chRect.width,
      container.clientWidth,
      opts.inline,
    );
    to.left = Math.max(
      0,
      Math.min(raw, container.scrollWidth - container.clientWidth),
    );
  }
  container.scrollTo(to);
}
