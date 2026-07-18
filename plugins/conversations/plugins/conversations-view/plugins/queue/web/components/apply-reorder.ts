import { Rank } from "@plugins/primitives/plugins/rank/core";
import { OpNoLongerApplies } from "@plugins/primitives/plugins/optimistic-mutation/web";
import type { QueueRankRow } from "../../core/resources";

export interface ReorderVars {
  conversationId: string;
  targetId: string;
  zone: "before" | "after";
}

// Pure client-side prediction of the server's reorder (mirrors
// server/internal/handle-reorder.ts → rankAdjacentTo + reseatGroupMembers):
//   1. compute a rank adjacent to the target (between target and its neighbor on
//      the drop side), and
//   2. reseat the dragged conversation's whole group to that rank. Group members
//      already share a rank, so "the group" is every row sharing the dragged
//      row's current rank.
// Operates on the LIVE ranks the point resource subscribes to (only conversations
// in the queue's live set), so adjacency computes over exactly the rows the
// server's live-filtered `rankAdjacentTo` sees — fixing the latent mismatch where
// the old whole-collection value predicted against stale ranks of gone
// conversations.
// Throws OpNoLongerApplies when the dragged or target row is missing (the snapshot
// moved under the drop — a row was removed, or the target left the live set,
// between drag-start and drop). The overlay drops such a stale op, so the
// authoritative push still reconciles. Any other throw would be a real bug and
// propagates loudly.
export function applyReorder(rows: QueueRankRow[], vars: ReorderVars): QueueRankRow[] {
  const { conversationId, targetId, zone } = vars;
  if (conversationId === targetId) return rows;

  const dragged = rows.find((r) => r.conversationId === conversationId);
  const target = rows.find((r) => r.conversationId === targetId);
  if (!dragged || !target) {
    throw new OpNoLongerApplies("applyReorder: dragged or target rank gone");
  }

  // Sorted live ranks excluding the dragged group (its members move together).
  const draggedGroupIds = new Set(
    rows
      .filter((r) => Rank.equals(r.rank, dragged.rank))
      .map((r) => r.conversationId),
  );
  const others = rows
    .filter((r) => !draggedGroupIds.has(r.conversationId))
    .sort((a, b) => Rank.compare(a.rank, b.rank));

  const targetIdx = others.findIndex((r) => r.conversationId === targetId);
  if (targetIdx === -1) {
    // Target was in the dragged group (shouldn't happen for a real drop). No-op.
    return rows;
  }

  const newRank = rankAdjacentTo(others, targetIdx, zone);

  return rows.map((r) =>
    draggedGroupIds.has(r.conversationId) ? { ...r, rank: newRank } : r,
  );
}

// Mirror of server rankAdjacentTo + safeBetween over the already-sorted,
// dragged-group-excluded `others` list.
function rankAdjacentTo(
  others: { rank: Rank }[],
  targetIdx: number,
  zone: "before" | "after",
): Rank {
  const target = others[targetIdx]!.rank;
  if (zone === "before") {
    const pred = targetIdx > 0 ? others[targetIdx - 1]!.rank : null;
    return safeBetween(pred, target);
  }
  const succ = targetIdx < others.length - 1 ? others[targetIdx + 1]!.rank : null;
  return safeBetween(target, succ);
}

function safeBetween(prev: Rank | null, next: Rank | null): Rank {
  if (prev && next && Rank.equals(prev, next)) {
    return Rank.between(prev, null);
  }
  return Rank.between(prev, next);
}
