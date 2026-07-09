import { desc, eq, isNull } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { _blocks } from "./tables";

/** Where a row sits now, and the `(parentId, rank)` pair the batch will give it. */
export interface RankPlacement {
  id: string;
  /** The parent the row sits under right now — the scope it is parked in. */
  currentParentId: string | null;
  /** The parent it will sit under after phase 2. */
  parentId: string | null;
  /** The final rank, as the stored string. */
  rank: string;
}

/** The `(parentId, rank)` pair a row the batch will INSERT is going to occupy. */
export type IncomingPlacement = Pick<RankPlacement, "parentId" | "rank">;

/**
 * Phase 1 of **park-then-place**: bump every row in `placements` to a scratch
 * ("park") rank *under the parent it already sits below*, chosen strictly
 * greater than every rank that will exist under that parent — both the ranks
 * stored there now and the final ranks this batch is about to write there. The
 * caller then runs its normal per-row UPDATE with the final `(parentId, rank)`
 * (phase 2), in any order.
 *
 * ## Why a scratch value is required
 *
 * `page_blocks` carries a per-tuple `UNIQUE NULLS NOT DISTINCT (parent_id,
 * rank)` index. It is **not** `DEFERRABLE` (drizzle cannot emit that), so every
 * single-row UPDATE is checked immediately. A batch that permutes ranks among
 * siblings therefore transiently duplicates a pair mid-loop:
 *
 * - `handleBulkMoveBlock` mints its `nBetween` window *excluding* the moving
 *   ids, so a computed key can equal a rank a still-unmoved sibling holds.
 *   (Under parent P with siblings `B="a1"`, `C="a2"`, `D="a3"`, moving `{B,D}`
 *   after `C`: the window `("a2", null)` yields `["a3","a4"]`, and `B → "a3"`
 *   lands while `D` still holds `"a3"`.)
 * - `handlePatchBlocks` writes client-computed rows verbatim; undoing a swap
 *   re-assigns two rows to each other's ranks.
 *
 * Re-ordering the UPDATEs cannot save either case: a 2-cycle (a plain swap) has
 * no safe order. Only a scratch value does.
 *
 * ## Why phase 2 is then unconditionally safe
 *
 * Let `floor(p) = max(every rank currently stored under p, every final rank the
 * batch writes under p)`, over both `placements` and `incoming`. Park keys under
 * `p` are `nBetween(floor(p), null, n)` — mutually distinct and each strictly
 * greater than `floor(p)`.
 *
 * - *Phase 1 is safe*: a park key exceeds every rank currently under `p`, and
 *   the keys are distinct, so no two parked rows meet.
 * - *Phase 2 is safe*: when a row is written to its final `(p, r)`, the only
 *   rows under `p` are (a) rows the batch never touched, whose ranks are
 *   `≤ floor(p)` but cannot equal `r` unless the caller handed two rows the
 *   same pair, and (b) still-parked rows, whose keys are `> floor(p) ≥ r`.
 *   Order within phase 2 is therefore irrelevant.
 *
 * Any collision that survives means the caller computed two identical final
 * pairs — a genuine bug, and the index fires loudly rather than silently
 * dropping an ordering.
 *
 * ## Why parking happens under the CURRENT parent
 *
 * Parking never rewrites `parent_id`. That keeps phase 1 free of foreign-key
 * order dependencies: a patch may reparent an existing row under a row the same
 * batch has not INSERTed yet, and parking it into that parent up front would
 * violate the self-FK. Vacating the row's old pair is all phase 1 owes phase 2,
 * and a pure rank bump does exactly that.
 *
 * Rows whose `(parentId, rank)` is unchanged need no parking — see
 * {@link pairChanged}; an UPDATE writing a row's own current pair is invisible
 * to the index.
 */
export async function parkRanks(
  tx: RankExecutor,
  args: {
    /** Existing rows being re-ranked and/or re-parented. */
    placements: RankPlacement[];
    /** Pairs the batch will INSERT afterwards. They only widen the floors. */
    incoming?: IncomingPlacement[];
  },
): Promise<void> {
  const { placements, incoming = [] } = args;
  if (placements.length === 0) return;

  // Final ranks landing under each parent — from re-ranked AND inserted rows.
  const finalsUnder = new Map<string | null, string[]>();
  for (const p of [...placements, ...incoming]) {
    const list = finalsUnder.get(p.parentId);
    if (list) list.push(p.rank);
    else finalsUnder.set(p.parentId, [p.rank]);
  }

  // Group the rows to park by the parent they currently live under.
  const parkedUnder = new Map<string | null, RankPlacement[]>();
  for (const p of placements) {
    const list = parkedUnder.get(p.currentParentId);
    if (list) list.push(p);
    else parkedUnder.set(p.currentParentId, [p]);
  }

  for (const [parentId, rows] of parkedUnder) {
    // Max rank CURRENTLY stored under this parent, over ALL its rows — including
    // ones this batch is moving, and (when the parent is a `page` block) its
    // content rows, which a page-scoped `loadPageBlocks` never returns.
    // `rank_text` is a C-collation domain, so byte order IS rank order.
    const [last] = await tx
      .select({ rank: _blocks.rank })
      .from(_blocks)
      .where(
        parentId === null ? isNull(_blocks.parentId) : eq(_blocks.parentId, parentId),
      )
      .orderBy(desc(_blocks.rank))
      .limit(1);

    const candidates = [...(finalsUnder.get(parentId) ?? [])];
    if (last) candidates.push(last.rank);
    // `rows` is non-empty and every parked row contributes its own final rank to
    // some parent, but not necessarily to THIS one (it may be moving away) — so
    // `last` is what guarantees a floor when the parent receives no finals. A
    // parent with a parked row always has at least that one row stored under it.
    const floor = candidates.reduce((a, b) => (a > b ? a : b));

    const park = Rank.nBetween(Rank.from(floor), null, rows.length);
    for (let i = 0; i < rows.length; i++) {
      await tx
        .update(_blocks)
        .set({ rank: park[i]!.toJSON() })
        .where(eq(_blocks.id, rows[i]!.id));
    }
  }
}

/**
 * `true` when the batch moves a row off the `(parent_id, rank)` pair it
 * occupies — i.e. it must be parked before the final writes land.
 */
export function pairChanged(
  current: { parentId: string | null; rank: string },
  next: { parentId: string | null; rank: string },
): boolean {
  return current.parentId !== next.parentId || current.rank !== next.rank;
}
