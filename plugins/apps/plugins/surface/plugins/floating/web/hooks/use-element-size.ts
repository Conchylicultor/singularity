import { useCallback, useLayoutEffect, useState } from "react";

/** The measured pixel box of an observed element ({0,0} until first measure). */
export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Measure an element's pixel box reactively via `ResizeObserver` — no polling,
 * no timers (mirrors `expandable` / `responsive-overflow`). The element to
 * observe is resolved through a `target` getter rather than the attached node
 * itself, so a caller can attach `ref` to one node yet measure a *different*
 * one — e.g. the dock attaches `ref` to its anchor but measures the anchor's
 * `offsetParent` (the desktop backdrop), whose size the minimap fractions need.
 *
 * Returns `[ref, size]`: spread `ref` onto a stable host element so the getter
 * has a node to resolve from, and read the live `{width,height}` (defaulting to
 * `{0,0}` until the first measure, which the minimap treats as "not yet
 * measured" via its null-fraction branch).
 *
 * The attached node is held in STATE (not a ref) so the observer effect can
 * depend on it without reading a ref during render — the callback-ref setter is
 * the single write, and a node attach/detach re-runs the effect.
 *
 * @param target Resolve the element to observe from the attached node. Defaults
 *   to the attached node itself (`(el) => el`). It is read inside the effect
 *   (not a dep), so an inline closure is fine — the effect re-runs on node
 *   change, re-resolving the target.
 */
export function useElementSize<T extends HTMLElement = HTMLElement>(
  target: (el: T) => Element | null | undefined = (el) => el,
): [(node: T | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [node, setNode] = useState<T | null>(null);
  const setRef = useCallback((next: T | null) => setNode(next), []);

  // Observe the resolved target: initial measure on mount + on every resize.
  useLayoutEffect(() => {
    const el = node ? target(node) : null;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe whenever the attached node changes; `target` is an inline closure read fresh, intentionally not a dep.
  }, [node]);

  return [setRef, size];
}
