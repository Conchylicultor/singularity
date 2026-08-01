import type { RefObject } from "react";

/**
 * How a programmatic caret landing treats the viewport.
 *
 * A programmatic landing never scrolls unless the trigger that moved the caret
 * opts in: "scroll" is an intent the trigger declares, not a default the caret
 * primitive imposes. (Native within-block typing and single-arrow motion don't
 * pass through these helpers — Lexical scroll-follows them straight from the DOM
 * input, and that is left untouched.)
 */
export interface CaretLandOptions {
  /** Follow the caret into view after landing. Default false. Only keyboard
   *  cross-block nav, split/merge, undo/redo, and explicit jump-to-block scroll;
   *  a pointer-driven placement lands where the user pointed (already visible). */
  scroll?: boolean;
  /**
   * Fired when the caret is really IN the surface — i.e. caret-READY, not merely
   * mounted. A CRDT-bound editor's root is childless until its content doc lands,
   * and there is nothing to hold a caret until then, so the two moments are
   * genuinely different (see `focusHydratingAware`).
   *
   * The caret authority injects it: while a landing is outstanding it owns the
   * keyboard and buffers what the user types, and this callback is the ONLY
   * signal that says "the buffer can be flushed into you now". A surface that
   * takes the caret and never reports back leaves the authority holding the
   * keyboard, so every landing path must call it.
   */
  onLanded?: () => void;
}

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
  focus: (opts?: CaretLandOptions) => void;
  /** Collapse the caret to the surface's very start/end. */
  focusBoundary?: (edge: "start" | "end", opts?: CaretLandOptions) => void;
  /** Place the caret at viewport column `x` on the surface's top/bottom visual line. */
  focusAtColumn?: (x: number, edge: "top" | "bottom", opts?: CaretLandOptions) => void;
}

/** How a host hands a `CaretSurface` to a component that must land the caret in it. */
export type CaretSurfaceRef = RefObject<CaretSurface | null>;
