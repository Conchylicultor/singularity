import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is at most `px` wide — the Files layout's breakpoints
 * (1100 / 900 / 640, from its mockup) for what CSS alone cannot drop: a tree
 * column, the listing beside an open file. Follows the media query's own
 * change event.
 */
export function useViewportAtMost(px: number): boolean {
  const query = `(max-width: ${px}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
