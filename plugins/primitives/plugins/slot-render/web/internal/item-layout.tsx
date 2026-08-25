import { createContext, useContext, type ReactNode } from "react";

/**
 * How the contributions rendered below are ACTUALLY laid out.
 *
 * `.Render` normally measures this off the slot's own host container (see the
 * sentinel in `render-slot.tsx`) and wraps each contribution in a `min-w-0`
 * flex cell when that host is a flex row. That measurement is only correct as
 * long as the contributions stay where the slot put them — and some hosts
 * *relocate* them: the `overflow` reorder node type moves its members out of
 * the row and into a portaled dropdown panel, which is a vertical block
 * context. There the horizontal cell is not merely useless, it is wrong: each
 * relocated contribution becomes a flex item of a row cell and shrink-wraps to
 * its own content, so a menu row stops spanning its menu.
 *
 * A relocating host declares the real context with `<SlotItemLayout>`, and the
 * cell honors it over what the slot measured. The declaration is read at RENDER
 * position (the cell is a component, not a bare element), so it applies to
 * contributions whose elements were created upstream and only mounted inside
 * the relocated surface.
 *
 * The three values answer one question — *what box is this contribution laid
 * out in* — and the third answers it with "not one of mine":
 *
 * - `"row"` — a horizontal flex line. Each contribution gets the `min-w-0` cell,
 *   so the shrink-chain reaches its text leaf.
 * - `"column"` — a vertical block or column. No cell; the contribution spans its
 *   host as it stands.
 * - `"host-owned"` — **the host draws each item's box itself.** Then the slot
 *   drawing a second one is not merely useless, it is a competing flex item
 *   beside the host's own: an `AdaptiveBar` mints one stable container per
 *   occupant and re-parents it to place it, so ITS container is the box, and a
 *   slot cell around the contribution would swallow the container and make the
 *   bar's gap, measurement and docking describe the cell instead of the row.
 *   The slot falls back to its layout-neutral `display: contents` box, which is
 *   what `renderIsolated` (the escape hatch such hosts used to reach for) has
 *   always produced. Nothing here is about `adaptive-bar`: any host that owns
 *   its items' boxes says the same thing.
 */
export type SlotItemOrientation = "row" | "column" | "host-owned";

const SlotItemLayoutContext = createContext<SlotItemOrientation | null>(null);

export function SlotItemLayout({
  orientation,
  children,
}: {
  orientation: SlotItemOrientation;
  children: ReactNode;
}) {
  return (
    <SlotItemLayoutContext.Provider value={orientation}>
      {children}
    </SlotItemLayoutContext.Provider>
  );
}

/** The declared orientation, or `null` when nothing overrides the measurement. */
export function useSlotItemLayout(): SlotItemOrientation | null {
  return useContext(SlotItemLayoutContext);
}
