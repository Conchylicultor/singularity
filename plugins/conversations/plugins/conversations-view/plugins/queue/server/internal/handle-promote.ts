import { z } from "zod";
import { getConversation, hasBlockingDep } from "@plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { lockDeck, rankForTop, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { setPinnedId, validatePin } from "./pinned";

const Body = z.object({ conversationId: z.string().min(1) });

export async function handlePromote(req: Request): Promise<Response> {
  const { conversationId } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankForTop(conversationId, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);

    const blocked = await hasBlockingDep(conv.taskId);
    if (blocked) {
      await validatePin(tx);
    } else {
      await setPinnedId(conversationId, tx);
    }
  });

  queueRanksResource.notify();
  return Response.json({ ok: true });
}
