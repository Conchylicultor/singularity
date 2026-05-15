import { z } from "zod";
import { getConversation } from "@plugins/tasks-core/server";
import { db } from "@plugins/database/server";
import { lockDeck, rankAfterN, reseatGroupMembers, upsertRank, findTaskIdForConversation } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { getPinnedId, setPinnedId, topWaitingByRank, validatePin } from "./pinned";
import { cascadeBlockedDependents } from "./cascade-blocked";

const Body = z.object({ conversationId: z.string().min(1), steps: z.number().int().positive() });

export async function handleStepDown(req: Request): Promise<Response> {
  const { conversationId, steps } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankAfterN(conversationId, steps, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);
    await cascadeBlockedDependents(conversationId, tx);

    const pinnedId = await getPinnedId(tx);
    if (pinnedId === conversationId) {
      const taskId = await findTaskIdForConversation(conversationId, tx);
      const nextId = await topWaitingByRank(conversationId, taskId ?? undefined, tx);
      await setPinnedId(nextId ?? conversationId, tx);
    } else {
      await validatePin(tx);
    }
  });

  queueRanksResource.notify();
  return Response.json({ ok: true });
}
