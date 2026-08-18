import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import {
  _conversations,
  _attempts,
  listBlockingDepIds,
} from "@plugins/tasks/plugins/tasks-core/server";
import {
  isBlockedStatus,
  TaskStatusSchema,
} from "@plugins/tasks/plugins/tasks-core/core";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { conversationsQueue } from "./tables";
import {
  lockDeck,
  rankAfterBlockers,
  rankForTop,
  reseatGroupMembers,
  upsertRank,
} from "./queue-ranks";

const LIVE_STATUSES = ["waiting", "working", "starting"] as const;

// Blocked/unblocked is the one task-level change that must move ranks: a task
// that just became blocked drops below every task blocking it, and one that just
// became unblocked returns to the top.
export const taskStatusRerankJob = defineJob({
  name: "queue.task-status-rerank",
  input: z.object({}).passthrough(),
  event: z
    .object({
      taskId: z.string(),
      status: TaskStatusSchema,
      previousStatus: TaskStatusSchema,
    })
    .passthrough(),
  dedup: "none",
  maxAttempts: 2,
  run: async ({ event }) => {
    // Blocked-ness is the predicate, not a single literal: `blocked` and
    // `in_progress_blocked` are the same blocked task with and without a live
    // agent, so a move between them is NOT a blocked/unblocked edge.
    const wasBlocked =
      event !== undefined && isBlockedStatus(event.previousStatus);
    const isBlocked = event !== undefined && isBlockedStatus(event.status);
    const becameBlocked = isBlocked && !wasBlocked;
    const becameUnblocked = wasBlocked && !isBlocked;

    if (becameBlocked && event?.taskId) {
      const blockingTaskIds = await listBlockingDepIds(event.taskId, db);
      if (blockingTaskIds.length > 0) {
        await rerankTaskConversations(event.taskId, (convId, tx) =>
          rankAfterBlockers(convId, blockingTaskIds, tx),
        );
      }
    } else if (becameUnblocked && event?.taskId) {
      await rerankTaskConversations(event.taskId, (convId, tx) =>
        rankForTop(convId, tx),
      );
    }
  },
});

async function rerankTaskConversations(
  taskId: string,
  computeRank: (
    convId: string,
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<Rank>,
): Promise<void> {
  const convRows = await db
    .select({ id: conversationsQueue.table.parentId })
    .from(conversationsQueue.table)
    .innerJoin(
      _conversations,
      eq(_conversations.id, conversationsQueue.table.parentId),
    )
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(
      and(
        eq(_attempts.taskId, taskId),
        inArray(_conversations.status, [...LIVE_STATUSES]),
      ),
    );
  if (convRows.length === 0) return;

  const leadId = convRows[0]!.id;
  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await computeRank(leadId, tx);
    await upsertRank(leadId, rank, tx);
    await reseatGroupMembers(leadId, rank, tx);
  });
}
