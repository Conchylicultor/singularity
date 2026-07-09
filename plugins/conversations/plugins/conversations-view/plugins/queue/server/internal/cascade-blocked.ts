import { and, asc, eq, inArray } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { _conversations, _attempts, listDependentIds, listBlockingDepIds } from "@plugins/tasks/plugins/tasks-core/server";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { conversationsQueue } from "./tables";
import {
  findTaskIdForConversation,
  rankAfterBlockers,
  reseatGroupMembers,
  upsertRank,
} from "./queue-ranks";

const LIVE_STATUSES: ConversationStatus[] = ["waiting", "working", "starting"];

export async function cascadeBlockedDependents(
  conversationId: string,
  tx: RankExecutor,
): Promise<void> {
  const startTaskId = await findTaskIdForConversation(conversationId, tx);
  if (!startTaskId) return;

  const frontier: string[] = [startTaskId];
  const visited = new Set<string>([startTaskId]);

  while (frontier.length > 0) {
    const currentTaskId = frontier.shift()!;
    const dependentTaskIds = await listDependentIds(currentTaskId, tx);

    for (const depTaskId of dependentTaskIds) {
      if (visited.has(depTaskId)) continue;
      visited.add(depTaskId);
      frontier.push(depTaskId);

      const leadRow = await leadConversation(depTaskId, tx);
      if (!leadRow) continue;

      const blockingTaskIds = await listBlockingDepIds(depTaskId, tx);
      if (blockingTaskIds.length === 0) continue;

      const requiredRank = await rankAfterBlockers(leadRow.id, blockingTaskIds, tx);
      const currentRank = Rank.from(leadRow.rank as string);
      if (Rank.compare(currentRank, requiredRank) >= 0) continue;

      await upsertRank(leadRow.id, requiredRank, tx);
      await reseatGroupMembers(leadRow.id, requiredRank, tx);
    }
  }
}

async function leadConversation(
  taskId: string,
  tx: RankExecutor,
): Promise<{ id: string; rank: string } | null> {
  const _cq = conversationsQueue.table;
  const [row] = await tx
    .select({ id: _cq.parentId, rank: _cq.rank })
    .from(_cq)
    .innerJoin(_conversations, eq(_conversations.id, _cq.parentId))
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        eq(_attempts.taskId, taskId),
        inArray(_conversations.status, LIVE_STATUSES),
      ),
    )
    .orderBy(asc(_cq.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}
