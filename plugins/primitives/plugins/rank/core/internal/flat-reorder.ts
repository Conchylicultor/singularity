import { Rank } from "./rank";

/** The minimal shape `computeFlatReorder` needs: a stable id and a sort `Rank`. */
export interface RankedItem {
  id: string;
  rank: Rank;
}

/**
 * Compute the `Rank` for a flat (non-hierarchical) drag-reorder: place
 * `draggedId` immediately `before`/`after` `targetId` within a single ranked
 * list. The authoritative rank arithmetic shared by flat reorder surfaces
 * (`rank-reorder`, the data-view manual-order) and the tree's sibling branches
 * (`computeDrop` delegates here).
 *
 * - Items are ordered by `Rank.compare`; the dragged item is excluded from its
 *   own neighborhood (a move within the same list must not treat the dragged row
 *   as a neighbor — mirrors the tree's `r.id !== draggedId` sibling filter).
 * - `before` → a rank strictly between the target's predecessor and the target;
 *   `after` → between the target and its successor (open ends via `null`).
 * - Returns `null` for an impossible drop: `draggedId === targetId`, an unknown
 *   `targetId`, or rank exhaustion/corruption (`Rank.between` throws) — the
 *   correct signal for the caller to abort the drop.
 */
export function computeFlatReorder(
  items: readonly RankedItem[],
  draggedId: string,
  position: "before" | "after",
  targetId: string,
): Rank | null {
  if (draggedId === targetId) return null;

  const ordered = items
    .filter((i) => i.id !== draggedId)
    .sort((a, b) => Rank.compare(a.rank, b.rank));
  const idx = ordered.findIndex((i) => i.id === targetId);
  if (idx === -1) return null;
  const target = ordered[idx]!;

  try {
    if (position === "before") {
      const prev = ordered[idx - 1];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      return Rank.between(prev?.rank ?? null, target.rank);
    }
    const next = ordered[idx + 1];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    return Rank.between(target.rank, next?.rank ?? null);
    // eslint-disable-next-line promise-safety/no-bare-catch -- Rank.between throws a plain Error on rank exhaustion/corruption; returning null aborts the reorder, the correct signal for an impossible drop position
  } catch {
    return null;
  }
}
