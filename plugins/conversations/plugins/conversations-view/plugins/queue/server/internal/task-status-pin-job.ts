import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { _conversations, _attempts, listBlockingDepIds } from "@plugins/tasks/plugins/tasks-core/server";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { validatePin } from "./pinned";
import { conversationsQueue } from "./tables";
import { lockDeck, rankAfterBlockers, rankForTop, reseatGroupMembers, upsertRank } from "./queue-ranks";

const LIVE_STATUSES = ["waiting", "working", "starting"] as const;

export const taskStatusPinJob = defineJob({
  name: "queue.task-status-pin",
  input: z.object({}).passthrough(),
  event: z.object({
    taskId: z.string(),
    status: z.string(),
    previousStatus: z.string(),
  }).passthrough(),
  dedup: "none",
  maxAttempts: 2,
  run: async ({ event }) => {
    const becameBlocked = event?.status === "blocked" && event.previousStatus !== "blocked";
    const becameUnblocked = event?.previousStatus === "blocked" && event.status !== "blocked";

    if (becameBlocked && event?.taskId) {
      const blockingTaskIds = await listBlockingDepIds(event.taskId);
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

    await validatePin();
  },
});

async function rerankTaskConversations(
  taskId: string,
  computeRank: (convId: string, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<Rank>,
): Promise<void> {
  const convRows = await db
    .select({ id: conversationsQueue.table.parentId })
    .from(conversationsQueue.table)
    .innerJoin(_conversations, eq(_conversations.id, conversationsQueue.table.parentId))
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
