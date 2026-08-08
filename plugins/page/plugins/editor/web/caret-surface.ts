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
   * It is the surface-level spelling of the generic crossing announcement
   * (`primitives/text-editor/caret-motion`), and it has to cross the surface
   * boundary as DATA rather than as a call: a `CaretSurface` deliberately has no
   * Lexical editor to announce on — the page title is a surface over an
   * `<input>` — so only the implementation that lands the caret can make the
   * announcement, and only the caller knows there was a crossing to announce.
   * What a crossing MEANS is not this contract's business: it exists because a
   * surface's very edge can be a position holding more caret state than a
   * landing produces, and the meaning is applied by whoever observes the
   * channel (`web/internal/mark-arrival.ts` for inline-mark boundaries).
   *
   * A click must never assert that state (nothing was crossed), so this is an
   * explicit declaration by the one caller that knows a crossing happened,
   * never an inference from `edge`.
   *
   * Bound, open: `focusBoundary` is synchronous today, so announcing right after
   * it is exact. If a future surface makes a BOUNDARY landing async the way
   * `focus` already is, the announcement has to move into the `onLanded` path.
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
  focusAtColumn?: (
    x: number,
    edge: "top" | "bottom",
    opts?: CaretLandOptions,
  ) => void;
}

/** How a host hands a `CaretSurface` to a component that must land the caret in it. */
export type CaretSurfaceRef = RefObject<CaretSurface | null>;
