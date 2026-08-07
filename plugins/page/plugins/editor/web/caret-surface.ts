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
   * Set only by a HORIZONTAL crossing, to the direction the caret is travelling
   * in (`landCaret`'s `left`/`right` arms). Absent for a click, a focus restore,
   * a vertical crossing, and every explicit placement.
   *
   * It exists because a surface's very edge can be an inline-mark boundary, and
   * such a boundary holds TWO caret states while the browser (and
   * `focusBoundary`'s own placement) only ever produces one. The arrival must
   * land on whichever of the two faces the side it came from — the same rule
   * `markArriveFor` applies to a step WITHIN a block, applied at the block seam,
   * which is why crossing into `` hello `code` `` from the right stops OUTSIDE
   * the code run and a second press is what goes inside.
   *
   * A click must never assert that state (nothing was crossed), so this is an
   * explicit declaration by the one caller that knows a crossing happened,
   * never an inference from `edge`.
   */
  crossing?: "left" | "right";
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
  /**
   * Fired when the surface has given up on landing the caret — the landing it
   * accepted will NOT happen. The failure dual of {@link onLanded}, and the
   * other half of the same obligation: a landing path must resolve one way or
   * the other, because "neither" is indistinguishable from "still waiting" and
   * leaves the caret authority holding the keyboard forever.
   *
   * Only an ASYNCHRONOUS landing can need it — a surface that places the caret
   * before returning has already succeeded. Today that is exactly
   * `focusHydratingAware`'s hydrating branch, which waits for content to arrive
   * and must abandon the landing if DOM focus moved elsewhere in the meantime.
   */
  onLandingLost?: () => void;
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
