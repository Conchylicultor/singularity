import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampToBounds,
  MIN_H,
  MIN_W,
  type Bounds,
  type Geometry,
} from "./use-window-geometry";

/** The two keyboard-driven verbs of the system menu (Win32 "Move" / "Size"). */
export type WindowInteraction = "move" | "size";

/** Arrow-key nudge step; Shift drops to a 1px precision step. */
const STEP = 16;
const FINE_STEP = 1;

/** The controls a host needs to drive (and reflect) a keyboard move/size mode. */
export interface WindowKeyboardInteraction {
  /** The active verb, or null when neither mode is running. */
  mode: WindowInteraction | null;
  /** Enter a mode — pops a snapped/maximized window free first (can't nudge a tile). */
  begin: (mode: WindowInteraction) => void;
  /** Commit the current box and leave the mode (no-op when idle). */
  commit: () => void;
}

/**
 * Keyboard-driven Move / Size modes — the functional half of the Win32 system
 * menu's "Move" and "Size" verbs, the only two that have no direct button in the
 * titlebar. While a mode is active, the arrow keys nudge the window's position
 * (move) or its bottom-right extent (size) by {@link STEP}px (Shift → 1px);
 * Enter or a click commits, Escape cancels and rolls the box back to the snapshot
 * captured on entry. The listener runs in the capture phase and swallows the keys
 * it handles, so the mode is modal and never races the global tiling shortcuts.
 *
 * Bounds (the desktop backdrop box) are read lazily via {@link getBounds} so the
 * move clamp matches the pointer-drag clamp without threading a ref through.
 */
export function useWindowKeyboardInteraction(
  geo: Geometry,
  setGeo: (next: (g: Geometry) => Geometry) => void,
  getBounds: () => Bounds | null,
): WindowKeyboardInteraction {
  const [mode, setMode] = useState<WindowInteraction | null>(null);

  // Latest geo, so the entry effect can snapshot the *current* box without
  // re-running on every geometry nudge (which would clobber the rollback origin).
  const geoRef = useRef(geo);
  geoRef.current = geo;

  // The box to restore on Escape, captured once when a mode begins.
  const originRef = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  const begin = useCallback(
    (next: WindowInteraction) => {
      // A snapped/maximized window pops back to its free box first — you can't
      // move or resize a tile in place.
      setGeo((g) =>
        g.snap === null
          ? g
          : {
              ...g,
              snap: null,
              ...(g.restore ?? {}),
              restore: undefined,
              minimized: false,
            },
      );
      setMode(next);
    },
    [setGeo],
  );

  const commit = useCallback(() => setMode(null), []);

  useEffect(() => {
    if (!mode) return;
    const { x, y, w, h } = geoRef.current;
    originRef.current = { x, y, w, h };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        const origin = originRef.current;
        if (origin) setGeo((g) => ({ ...g, ...origin }));
        setMode(null);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        setMode(null);
        return;
      }
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowLeft":
          dx = -1;
          break;
        case "ArrowRight":
          dx = 1;
          break;
        case "ArrowUp":
          dy = -1;
          break;
        case "ArrowDown":
          dy = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? FINE_STEP : STEP;
      const bounds = getBounds();
      if (mode === "move") {
        setGeo((g) => {
          const moved = { ...g, x: g.x + dx * step, y: g.y + dy * step };
          return bounds ? clampToBounds(moved, bounds) : moved;
        });
      } else {
        setGeo((g) => ({
          ...g,
          w: Math.max(MIN_W, g.w + dx * step),
          h: Math.max(MIN_H, g.h + dy * step),
        }));
      }
    };

    // A click anywhere drops the window where it is (Win32 behaviour). Bound on
    // the next tick so the menu-item click that started the mode doesn't end it.
    let armed = false;
    const arm = () => {
      armed = true;
    };
    const onPointerDown = () => {
      if (armed) setMode(null);
    };
    const armId = window.setTimeout(arm, 0);

    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.clearTimeout(armId);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [mode, setGeo, getBounds]);

  return { mode, begin, commit };
}
