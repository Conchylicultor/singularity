import type { CaretSurface } from "../caret-surface";
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
 * - Horizontal crossings land on the boundary the caret was travelling toward.
 * - A surface that offers neither refinement just takes focus.
 *
 * `caret` is absent for void/textarea blocks that have no measurable caret; the
 * landing degrades to the boundary.
 */
export function landCaret(
  surface: CaretSurface,
  dir: CaretDirection,
  caret?: CaretContext,
): void {
  switch (dir) {
    case "up":
      if (caret && surface.focusAtColumn) surface.focusAtColumn(caret.caretX, "bottom");
      else landBoundary(surface, "end");
      return;
    case "down":
      if (caret && surface.focusAtColumn) surface.focusAtColumn(caret.caretX, "top");
      else landBoundary(surface, "start");
      return;
    case "left":
      landBoundary(surface, "end");
      return;
    case "right":
      landBoundary(surface, "start");
      return;
  }
}

function landBoundary(surface: CaretSurface, edge: "start" | "end"): void {
  if (surface.focusBoundary) surface.focusBoundary(edge);
  else surface.focus();
}
