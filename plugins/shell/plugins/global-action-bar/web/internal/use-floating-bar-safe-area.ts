import { useEffect, useState } from "react";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";

/**
 * The CSS var `pr-floating-bar` / `pr-floating-bar-pane` read: the right inset
 * a surface-edge header reserves so the floating bar does not cover its
 * actions. It exists on `:root` **iff** the floating bar is mounted, so a
 * header falls back to its own end inset whenever the bar is docked or off.
 */
const SAFE_AREA_VAR = "--floating-bar-safe-area";

/**
 * Publish the floating bar's safe area while the calling component is mounted.
 * Returns a callback ref for the collapsed trigger.
 *
 * The reservation is measured from the trigger's LEFT edge to the viewport's
 * right edge (so it includes the bar's corner offset and its panel chrome, and
 * follows the density preset), plus the pane header's own end inset as the gap
 * between the header's last action and the bar. It is the COLLAPSED footprint
 * only: the bar expands leftward on hover as a card over the header, and the
 * trigger stays put, so the value does not change while it is open. The bar is
 * `fixed right-*`, so a window resize moves the trigger's left edge with the
 * viewport's right one and the distance holds — only a resize of the trigger
 * itself needs a re-measure.
 */
export function useFloatingBarSafeArea(): (node: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useResizeObserver(
    () => node,
    () => {
      if (!node) return;
      const room = window.innerWidth - node.getBoundingClientRect().left;
      document.documentElement.style.setProperty(
        SAFE_AREA_VAR,
        `calc(${Math.ceil(room)}px + var(--chrome-pane-pad-end))`,
      );
    },
    { deps: [node] },
  );

  // Withdraw the reservation with the bar (docked mode, config off, embed).
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(SAFE_AREA_VAR);
    },
    [],
  );

  return setNode;
}
