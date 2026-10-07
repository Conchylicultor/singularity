/**
 * Run `change` — anything that re-lays-out `scroller`'s content (tiles resized,
 * rows re-wrapped) — and keep `anchor` where it was on screen: `scroller` is
 * scrolled by however far the change moved it. The zoom-around-a-point of a
 * scrolling layout: a grid resized under the pointer grows around the tile the
 * pointer is on instead of running away from it.
 *
 * Synchronous on purpose: the anchor is measured before `change`, and again
 * after (forcing one layout), and the scroll lands before the next paint, so
 * no frame shows the jump.
 */
export function keepInPlace(
  scroller: HTMLElement,
  anchor: Element | null,
  change: () => void,
): void {
  const before = anchor?.getBoundingClientRect().top;
  change();
  if (!anchor || before === undefined || !anchor.isConnected) return;
  const moved = anchor.getBoundingClientRect().top - before;
  if (moved !== 0) scroller.scrollTop += moved;
}
