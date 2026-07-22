export interface ScrollToBottomOptions {
  behavior?: ScrollBehavior;
}

/** Imperative sanctioned funnel: scroll a container to its bottom edge. The
 * bottom-pin analog of scroll-reveal's revealElement — for callers that hold an
 * element but not a mounted useStickyScroll handle. */
export function scrollToBottom(
  el: HTMLElement | null | undefined,
  opts?: ScrollToBottomOptions,
): void {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: opts?.behavior ?? "auto" });
}
