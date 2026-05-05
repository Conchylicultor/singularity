import { z } from "zod";
import { getConversation, hasBlockingDep, listBlockingDepIds } from "@plugins/tasks-core/server";
import { positionTwoRank, rankAfterBlockers } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";

const Body = z.object({ conversationId: z.string().min(1) });

export async function handleRerank(req: Request): Promise<Response> {
  const { conversationId } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });

  let rank;
  if (conv.taskId && (await hasBlockingDep(conv.taskId))) {
    const blockingTaskIds = await listBlockingDepIds(conv.taskId);
    rank = await rankAfterBlockers(conversationId, blockingTaskIds);
  } else {
    rank = await positionTwoRank();
  }

  await conversationsQueue.upsert(conversationId, { rank: rank.toJSON() });
  queueRanksResource.notify();
  return Response.json({ ok: true });
}
