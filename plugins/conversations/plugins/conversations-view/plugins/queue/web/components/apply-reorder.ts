import { Rank } from "@plugins/primitives/plugins/rank/core";
import { OpNoLongerApplies } from "@plugins/primitives/plugins/optimistic-mutation/web";
import type { QueueData } from "../../shared/resources";

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
//      already share a rank in QueueData, so "the group" is every row sharing the
//      dragged row's current rank.
// Throws OpNoLongerApplies when the dragged or target row is missing a rank
// (the snapshot moved under the drop — e.g. a row was removed between drag-start
// and drop). The overlay drops such a stale op, so the authoritative push still
// reconciles. Any other throw would be a real bug and propagates loudly.
export function applyReorder(data: QueueData, vars: ReorderVars): QueueData {
  const { conversationId, targetId, zone } = vars;
  if (conversationId === targetId) return data;

  const dragged = data.ranks.find((r) => r.conversationId === conversationId);
  const target = data.ranks.find((r) => r.conversationId === targetId);
  if (!dragged || !target) {
    throw new OpNoLongerApplies("applyReorder: dragged or target rank gone");
  }

  // Sorted live ranks excluding the dragged group (its members move together).
  const draggedGroupIds = new Set(
    data.ranks
      .filter((r) => Rank.equals(r.rank, dragged.rank))
      .map((r) => r.conversationId),
  );
  const others = data.ranks
    .filter((r) => !draggedGroupIds.has(r.conversationId))
    .sort((a, b) => Rank.compare(a.rank, b.rank));

  const targetIdx = others.findIndex((r) => r.conversationId === targetId);
  if (targetIdx === -1) {
    // Target was in the dragged group (shouldn't happen for a real drop). No-op.
    return data;
  }

  const newRank = rankAdjacentTo(others, targetIdx, zone);

  return {
    ...data,
    ranks: data.ranks.map((r) =>
      draggedGroupIds.has(r.conversationId) ? { ...r, rank: newRank } : r,
    ),
  };
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
