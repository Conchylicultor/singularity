import { asc, eq, inArray } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { _conversations, _attempts, listBlockingDepIds } from "@plugins/tasks/plugins/tasks-core/server";
import type { ConversationStatus } from "@plugins/conversations/core";
import { conversationsQueue } from "./tables";
import { lockDeck, rankAfterBlockers, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { validatePin } from "./pinned";
import { queueRanksResource } from "./resource";

const LIVE_STATUSES: ConversationStatus[] = ["waiting", "working", "starting"];

export async function repairBlockedOrder(): Promise<void> {
  await db.transaction(async (tx) => {
    await lockDeck(tx);

    const _cq = conversationsQueue.table;
    let madeChanges = true;

    while (madeChanges) {
      madeChanges = false;

      const rows = await tx
        .select({
          convId: _cq.parentId,
          rank: _cq.rank,
          taskId: _attempts.taskId,
        })
        .from(_cq)
        .innerJoin(_conversations, eq(_conversations.id, _cq.parentId))
        .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
        .where(inArray(_conversations.status, LIVE_STATUSES))
        .orderBy(asc(_cq.rank));

      const taskLeads = new Map<string, { convId: string; rank: string }>();
      for (const row of rows) {
        if (!taskLeads.has(row.taskId)) {
          taskLeads.set(row.taskId, { convId: row.convId, rank: row.rank });
        }
      }

      for (const [taskId, lead] of taskLeads) {
        const blockingTaskIds = await listBlockingDepIds(taskId);
        if (blockingTaskIds.length === 0) continue;

        const requiredRank = await rankAfterBlockers(lead.convId, blockingTaskIds, tx);
        const currentRank = Rank.from(lead.rank as string);
        if (Rank.compare(currentRank, requiredRank) >= 0) continue;

        await upsertRank(lead.convId, requiredRank, tx);
        await reseatGroupMembers(lead.convId, requiredRank, tx);
        madeChanges = true;
      }
    }

    await validatePin(tx);
  });

  queueRanksResource.notify();
}
