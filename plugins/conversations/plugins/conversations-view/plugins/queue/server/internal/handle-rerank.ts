import { z } from "zod";
import { getConversation } from "@plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { lockDeck, rankForTop, rankJoiningGroup, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";

const Body = z.object({ conversationId: z.string().min(1) });

export async function handleRerank(req: Request): Promise<Response> {
  const { conversationId } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    // If the task already has a group in the queue, join it; otherwise go to top.
    const groupRank = await rankJoiningGroup(conv.taskId, conversationId, tx);
    const rank = groupRank ?? await rankForTop(conversationId, tx);
    await upsertRank(conversationId, rank, tx);
    await validatePin(tx);
  });

  queueRanksResource.notify();
  return Response.json({ ok: true });
}
