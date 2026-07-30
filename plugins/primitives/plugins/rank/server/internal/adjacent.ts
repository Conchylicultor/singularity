import { Rank } from "@plugins/primitives/plugins/rank/core";

/**
 * The minimal shape `rankAdjacentTo` reads off a row: its identity, its place in
 * the hierarchy, and its rank (as the stored string or an already-wrapped
 * `Rank`). Structural on purpose — every ranked table's own row type satisfies
 * it, so no caller has to project or adapt.
 */
export interface RankAdjacentRow {
  id: string;
  parentId: string | null;
  rank: Rank | string;
}

const asRank = (rank: Rank | string): Rank =>
  typeof rank === "string" ? Rank.from(rank) : rank;

/**
 * Mint the rank that places a row immediately `zone` of `targetId` among the
 * siblings of `parentId`. The canonical server-side resolver for a DnD move,
 * whose wire contract carries positional intent — `(targetId, zone)` — and never
 * a rank. The `afterId`-shaped sibling is `rankAfterSibling`, which reads its
 * neighbourhood from the DB instead of a caller-supplied set.
 *
 * `targetId === null` addresses the sibling-list boundary rather than a
 * neighbour: `"after"` appends at the end, `"before"` prepends at the start.
 *
 * `excludeIds` are rows leaving this sibling list (the moved row itself), so
 * they never bound their own insertion point.
 *
 * `rows` MUST be the COMPLETE sibling set — every row with that `parentId`,
 * unfiltered by any secondary scope the caller's own reads happen to apply. One
 * ordering space is routinely projected disjointly by several readers (page
 * blocks are scoped by `page_id` and by `type`; a list is filtered or searched);
 * arithmetic over a filtered projection mints keys that collide with the
 * invisible siblings.
 *
 * **This lives in `server/`, not `core/`, on purpose.** It is a pure function
 * and would run fine in a browser — but the placement is what carries the
 * invariant "only a holder of the complete sibling set may mint a rank". A
 * client holds a projection by construction, so a `core/` version reachable from
 * the browser would be the bug this API exists to prevent.
 *
 * Pure over `rows` (the caller loads them, inside its own transaction, so the
 * window cannot go stale before the write lands).
 *
 * An unknown `targetId` throws: a bad anchor is a caller bug, and a silent
 * append is exactly the class of failure this API exists to prevent.
 *
 * A DEGENERATE neighbourhood — two siblings already sharing a rank — does NOT
 * throw, and that is deliberate. Both neighbour scans are strict (`< 0` / `> 0`),
 * so a duplicated rank is collapsed into one position and the minted key lands
 * cleanly outside the whole tied run; `Rank.between(r, r)` is never constructed.
 * The result is unambiguous rather than corrupt: a drop "between" two rows that
 * hold no order relative to each other has no other honest answer. Consumers
 * where ties are LEGITIMATE (the conversation queue seats a whole task group at
 * one shared rank) therefore compose with this, instead of needing their own
 * resolver just to dodge an abort.
 */
export function rankAdjacentTo(
  rows: readonly RankAdjacentRow[],
  parentId: string | null,
  targetId: string | null,
  zone: "before" | "after",
  excludeIds: ReadonlySet<string>,
): Rank {
  const siblings = rows
    .filter((r) => r.parentId === parentId && !excludeIds.has(r.id))
    .map((r) => asRank(r.rank))
    .sort((a, b) => Rank.compare(a, b));

  if (targetId === null) {
    return zone === "after"
      ? Rank.between(siblings[siblings.length - 1] ?? null, null)
      : Rank.between(null, siblings[0] ?? null);
  }

  const targetRow = rows.find((r) => r.id === targetId);
  if (!targetRow) {
    throw new Error(`rankAdjacentTo: target ${targetId} is not among the siblings`);
  }
  const target = asRank(targetRow.rank);

  if (zone === "before") {
    const preds = siblings.filter((r) => Rank.compare(r, target) < 0);
    return Rank.between(preds[preds.length - 1] ?? null, target);
  }
  const succ = siblings.find((r) => Rank.compare(r, target) > 0) ?? null;
  return Rank.between(target, succ);
}
