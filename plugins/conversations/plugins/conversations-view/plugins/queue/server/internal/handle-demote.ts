import { z } from "zod";
import { getConversation } from "@plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { lockDeck, rankForBottom, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";
import { cascadeBlockedDependents } from "./cascade-blocked";

const Body = z.object({ conversationId: z.string().min(1) });

export async function handleDemote(req: Request): Promise<Response> {
  const { conversationId } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankForBottom(conversationId, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);
    await cascadeBlockedDependents(conversationId, tx);
    await validatePin(tx);
  });

  queueRanksResource.notify();
  return Response.json({ ok: true });
}
