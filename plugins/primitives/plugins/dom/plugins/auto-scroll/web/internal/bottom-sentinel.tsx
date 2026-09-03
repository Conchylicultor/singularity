import type { ReactElement } from "react";

/**
 * The zero-height marker `useStickyScroll` watches to answer "is the bottom on
 * screen?".
 *
 * It contributes nothing to layout — its *position* is the entire signal — so it
 * carries no styling beyond collapsing itself. In particular it deliberately
 * does NOT try to stay put horizontally: an `axis="both"` surface would carry a
 * left-anchored marker out of view when scrolled right, and that is corrected
 * once, in `sentinelObserverOptions`, by widening the observer's root rect
 * rather than in every sentinel.
 *
 * The attach callback is named `attach` rather than `ref` on purpose: the hook
 * builds this element during its own render, and a prop literally named `ref`
 * is what `react-hooks/refs` (rightly) refuses there. The binding itself happens
 * below, in ordinary JSX, at the only moment it is safe.
 */
export function BottomSentinel({
  attach,
}: {
  attach: (el: HTMLDivElement | null) => void;
}): ReactElement {
  return (
    <div
      ref={attach}
      aria-hidden="true"
      data-sticky-scroll-sentinel=""
      style={{ width: 0, height: 0 }}
    />
  );
}
