import { z } from "zod";
import { getConversation, hasBlockingDep, listBlockingDepIds } from "@plugins/tasks-core/server";
import { lockDeck, positionTwoRank, rankAfterBlockers } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";
import { db } from "@server/db/client";

const Body = z.object({ conversationId: z.string().min(1) });

export async function handleRerank(req: Request): Promise<Response> {
  const { conversationId } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });

  await db.transaction(async (tx) => {
    await lockDeck(tx);

    let rank;
    if (conv.taskId && (await hasBlockingDep(conv.taskId))) {
      const blockingTaskIds = await listBlockingDepIds(conv.taskId);
      rank = await rankAfterBlockers(conversationId, blockingTaskIds, tx);
    } else {
      rank = await positionTwoRank(conversationId, tx);
    }

    const now = new Date();
    await tx
      .insert(conversationsQueue.table)
      .values({ parentId: conversationId, rank: rank.toJSON(), updatedAt: now })
      .onConflictDoUpdate({
        target: conversationsQueue.table.parentId,
        set: { rank: rank.toJSON(), updatedAt: now },
      });
  });

  queueRanksResource.notify();
  return Response.json({ ok: true });
}
