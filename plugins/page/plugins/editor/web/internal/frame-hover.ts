import { useCallback } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";

/**
 * Which container frames the pointer is currently inside — the signal a card's
 * corner decoration reveals itself on.
 *
 * ## Why this is state and not a CSS `:hover`
 *
 * A frame is a BACKDROP: it is a grid SIBLING of the rows it spans, not their
 * ancestor (that is what lets a block be indented across a frame boundary
 * without remounting its Lexical instance — see `internal/block-frames.ts`).
 * So the card has no DOM element containing both its box and its lines, and
 * `group-hover` has nothing to hang off. The frame's own wrapper cannot stand
 * in for one either: it is `pointer-events-none`, and every point inside it is
 * covered by a row painted above it, so it can never be `:hover`ed itself.
 *
 * ## Why a store and not `useState` in the editor
 *
 * The rows report hover on every pointer crossing. Holding that in editor state
 * would re-render every row of the page — hundreds of them, mid-mouse-move —
 * to change the opacity of one label. The store's writes trigger no render at
 * all, and the only subscribers are the anchor decorations themselves
 * (`AnchorDecoration`), which bail out unless their own answer flipped.
 *
 * ## The value is the CHAIN, not the innermost frame
 *
 * A card nested in another card is inside both, and both name themselves when
 * you point at the inner one — each label sits at its own box's corner, so they
 * do not collide, and a card that stayed anonymous while the pointer was
 * demonstrably inside it would be the bug this reveals exist to avoid.
 */
const frameHover = defineScopedStore<readonly string[]>([]);

/**
 * Mounted by each surface around its block list. Both surfaces provide it — the
 * editor writes from its rows, the read-only renderer from its container
 * wrappers — so the decoration has ONE way of knowing it is pointed at rather
 * than one per surface.
 */
export const FrameHoverProvider = frameHover.Provider;

/** Is the pointer inside this container's box? `false` for a frame-less id. */
export function useFrameHovered(blockId: string | undefined): boolean {
  return frameHover.useSelector(
    (ids) => (blockId === undefined ? false : ids.includes(blockId)),
    [blockId],
  );
}

/**
 * The surface's writer: hand it the frames covering the row (or subtree) the
 * pointer just entered, outermost first, or nothing on the way out.
 *
 * Stable across renders and renders nothing itself, so a row can hold it in a
 * handler without becoming a subscriber.
 */
export function useSetFrameHover(): (ids: readonly string[]) => void {
  const api = frameHover.useStoreApi();
  return useCallback(
    (ids: readonly string[]) => {
      // Collapse "still nothing" to the same array identity: the store bails on
      // an `Object.is`-equal state, so leaving one unframed row for the next
      // notifies nobody.
      api.setState((prev) =>
        prev.length === 0 && ids.length === 0 ? prev : ids,
      );
    },
    [api],
  );
}
