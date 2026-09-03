import { useRef, useState, type RefObject } from "react";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";

/**
 * Slack the row must have beyond the exact fit before folded ancestors come
 * back. Without a margin, "fold" and "unfold" share their boundary condition
 * and a one-subpixel measurement disagreement flips the trail every frame.
 */
const EXPAND_MARGIN_PX = 4;

/** A measured difference this small is a rounding artefact, not an overflow. */
const SUBPIXEL_PX = 1;

/** The ancestor run's open width, and the trail it was measured on. */
interface OpenWidth {
  trailKey: string;
  px: number;
}

export interface AncestorCollapseInput {
  /** The trail itself. It takes the row's slack, so its width IS the room. */
  rootRef: RefObject<HTMLElement | null>;
  /** The ancestor run — the full crumbs when open, the overflow crumb when folded. */
  prefixRef: RefObject<HTMLElement | null>;
  /** The current page's label, the one leaf allowed to truncate. */
  leafRef: RefObject<HTMLElement | null>;
  /** Identity of the trail being shown; a new one re-decides from scratch. */
  trailKey: string;
  /** False when there are no ancestors to fold (a root page). */
  foldable: boolean;
}

/**
 * Decides whether the ancestors are folded behind an overflow crumb.
 *
 * **The promise this exists to keep: the page's own name is never the thing
 * that gets cut.** The ancestors are secondary — they can leave the row and
 * still be one click away — while the leaf is the answer to "what am I looking
 * at", so it is the last thing to give, not the first.
 *
 * Two measurements decide it, both read off the real rendered boxes:
 *
 * - **Fold** when the leaf has started truncating (`scrollWidth > clientWidth`).
 *   The ancestors are rigid, so the leaf is the only cell flex can take room
 *   from — its truncation IS the row reporting that it is over-full.
 * - **Unfold** when the row's trailing slack covers what unfolding would cost
 *   (the ancestor run's open width minus the folded crumb's), plus a margin.
 *
 * The open width is **stamped with the trail it was measured on**, so a new
 * trail cannot be judged against the last one's numbers — and it is one ref
 * rather than a width plus an effect that clears it, because two pieces of
 * state can disagree about which trail they describe and one cannot.
 *
 * Deliberately NOT `AdaptiveBar`, which solves a neighbouring problem: that bar
 * relocates *occupants contributed by other plugins*, each declaring its own
 * ladder of smaller forms, demoting from the trailing edge. A trail's segments
 * come from its own caller, carry no forms, fold from the FRONT, and must keep
 * their order and their leaf. Sharing the ledger would mean teaching it all of
 * that; the decision here is one boolean.
 *
 * **What it needs from the layout**: the trail must be given a definite width
 * (it takes the row's slack, so it is, wherever the row itself has one). Inside
 * a parent that shrink-wraps its content instead, the room around the trail is
 * invisible to it, and a folded trail stays folded until something else
 * re-renders it — it never mis-folds, it just doesn't notice new room.
 */
export function useAncestorCollapse({
  rootRef,
  prefixRef,
  leafRef,
  trailKey,
  foldable,
}: AncestorCollapseInput): boolean {
  const [folded, setFolded] = useState(false);
  /** The ancestor run's width when last seen open — what unfolding costs. */
  const openWidth = useRef<OpenWidth | null>(null);

  useResizeObserver(
    rootRef,
    () => {
      const root = rootRef.current;
      const leaf = leafRef.current;
      if (root === null || leaf === null || !foldable) return;

      const leafDeficit = leaf.scrollWidth - leaf.clientWidth;

      if (!folded) {
        // Open: the run is rigid, so its box is its natural width — the number
        // unfolding will later be compared against.
        const prefix = prefixRef.current;
        if (prefix !== null) {
          openWidth.current = {
            trailKey,
            px: prefix.getBoundingClientRect().width,
          };
        }
        if (leafDeficit > SUBPIXEL_PX) setFolded(true);
        return;
      }

      const open = openWidth.current;
      if (open === null || open.trailKey !== trailKey) {
        // Folded, with no open measurement of THIS trail — it arrived folded,
        // or the segments changed underneath. Show it: the next pass measures
        // it and folds again if it really doesn't fit. Both passes run before
        // paint, so the open state is never painted.
        setFolded(false);
        return;
      }
      if (leafDeficit > SUBPIXEL_PX) return; // still over-full — stay folded

      // The row is left-packed, so its free space is what lies past its last
      // child's right edge.
      const last = root.lastElementChild;
      if (last === null) return;
      const free =
        root.getBoundingClientRect().right - last.getBoundingClientRect().right;
      const foldedWidth = prefixRef.current?.getBoundingClientRect().width ?? 0;
      if (free >= open.px - foldedWidth + EXPAND_MARGIN_PX) setFolded(false);
    },
    { deps: [trailKey, folded, foldable] },
  );

  return folded && foldable;
}
