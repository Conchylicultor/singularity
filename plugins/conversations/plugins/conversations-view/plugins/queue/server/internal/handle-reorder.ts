import { z } from "zod";
import { db } from "@plugins/database/server";
import { lockDeck, rankAdjacentTo, reseatGroupMembers, upsertRank } from "./queue-ranks";
import { queueRanksResource } from "./resource";
import { validatePin } from "./pinned";

const Body = z.object({
  conversationId: z.string().min(1),
  targetId: z.string().min(1),
  zone: z.enum(["before", "after"]),
});

export async function handleReorder(req: Request): Promise<Response> {
  const { conversationId, targetId, zone } = Body.parse(await req.json());
  if (conversationId === targetId) return Response.json({ ok: true });

  await db.transaction(async (tx) => {
    await lockDeck(tx);
    const rank = await rankAdjacentTo(targetId, zone, tx);
    await upsertRank(conversationId, rank, tx);
    await reseatGroupMembers(conversationId, rank, tx);
    await validatePin(tx);
  });

  queueRanksResource.notify();
  return Response.json({ ok: true });
}
