import type { CaretLandOptions, CaretSurface } from "../caret-surface";
import type { CaretContext } from "./caret-geometry";

/** The direction a caret leaves its current surface in. */
export type CaretDirection = "up" | "down" | "left" | "right";

/**
 * Land the caret in `surface`, coming from `dir`.
 *
 * The rules are the same whether the surface is a block or the host chrome next
 * to the block list (the page title), which is why they live here rather than in
 * the block-order walk:
 *
 * - Vertical crossings preserve the caret's pixel column when the surface can
 *   honor it, entering on the visual line facing the origin.
 * - Horizontal crossings land on the boundary the caret was travelling toward,
 *   and declare the travel direction (`crossing`) so a surface whose edge is an
 *   inline-mark boundary can land on the state facing the approach rather than
 *   the one its own placement produces. Vertical crossings deliberately do NOT
 *   declare it: a mark stop costs a horizontal press, never a line change.
 * - A surface that offers neither refinement just takes focus.
 *
 * `caret` is absent for void/textarea blocks that have no measurable caret; the
 * landing degrades to the boundary.
 *
 * `opts` carries the scroll intent (default no-scroll) straight through to the
 * surface: keyboard cross-block nav passes `{ scroll: true }` so the caret is
 * revealed, while a pointer-driven landing leaves it off.
 */
export function landCaret(
  surface: CaretSurface,
  dir: CaretDirection,
  caret?: CaretContext,
  opts?: CaretLandOptions,
): void {
  switch (dir) {
    case "up":
      if (caret && surface.focusAtColumn)
        surface.focusAtColumn(caret.caretX, "bottom", opts);
      else landBoundary(surface, "end", opts);
      return;
    case "down":
      if (caret && surface.focusAtColumn)
        surface.focusAtColumn(caret.caretX, "top", opts);
      else landBoundary(surface, "start", opts);
      return;
    case "left":
      landBoundary(surface, "end", { ...opts, crossing: "left" });
      return;
    case "right":
      landBoundary(surface, "start", { ...opts, crossing: "right" });
      return;
  }
}

function landBoundary(
  surface: CaretSurface,
  edge: "start" | "end",
  opts?: CaretLandOptions,
): void {
  if (surface.focusBoundary) surface.focusBoundary(edge, opts);
  else surface.focus(opts);
}
