import type { RefObject } from "react";

/**
 * A surface that can hold a text caret.
 *
 * Every focusable block implements it (`BlockFocusHandle` widens it with the
 * content-surgery members only a bound text editor can provide), and so can
 * chrome a host renders *beside* the block list — the page title. That shared
 * contract is what lets the caret cross the editor's boundary: `navigate()`
 * walks the block order, and when it runs off the first/last block it lands on
 * the adjacent surface with the same landing rules it would use for a block.
 *
 * `focus` is the only required member: a surface must at least be able to take
 * the caret somewhere. The optional members refine *where* — a surface that
 * omits `focusAtColumn` simply gets the boundary landing instead.
 */
export interface CaretSurface {
  /** Take the caret, restoring the surface's last selection. */
  focus: () => void;
  /** Collapse the caret to the surface's very start/end. */
  focusBoundary?: (edge: "start" | "end") => void;
  /** Place the caret at viewport column `x` on the surface's top/bottom visual line. */
  focusAtColumn?: (x: number, edge: "top" | "bottom") => void;
}

/** How a host hands a `CaretSurface` to a component that must land the caret in it. */
export type CaretSurfaceRef = RefObject<CaretSurface | null>;
