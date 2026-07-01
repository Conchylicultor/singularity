import { type RefObject, useLayoutEffect, useRef } from "react";
import {
  drawSystem,
  type EngravePlan,
  type EngraveColors,
  type SystemDrawResult,
} from "./engrave";

/**
 * One virtualized system row: draws its own `<svg>` on mount and registers the
 * resulting `{ anchors, notes }` into the shared registry (keyed by system
 * index) so the parent's imperative playhead + highlight can read it without a
 * React render. Draws in a layout effect (paint-before-show, no flash); on
 * unmount it clears highlight classes, unregisters, and empties the host so a
 * scrolled-away system leaves no SVG DOM behind. `onDrawn` lets the parent
 * re-apply the cursor immediately after this system (re)mounts.
 */
function NotationSystem({
  plan,
  systemIndex,
  colors,
  registryRef,
  onDrawn,
}: {
  plan: EngravePlan;
  systemIndex: number;
  colors: EngraveColors;
  registryRef: RefObject<Map<number, SystemDrawResult>>;
  onDrawn: RefObject<((i: number) => void) | null>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The registry Map identity is stable; capture it so the cleanup below
    // uses the same instance the effect body registered into.
    const registry = registryRef.current;
    const res = drawSystem(host, plan, systemIndex, colors);
    registry.set(systemIndex, res);
    onDrawn.current?.(systemIndex);
    return () => {
      for (const n of res.notes) n.el.classList.remove("is-active");
      registry.delete(systemIndex);
      host.innerHTML = "";
    };
  }, [plan, systemIndex, colors, registryRef, onDrawn]);
  return <div ref={hostRef} />;
}

export { NotationSystem };
