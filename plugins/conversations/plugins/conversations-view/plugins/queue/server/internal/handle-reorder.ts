import { z } from "zod";
import { getConversation } from "@plugins/tasks-core/server";
import { rankAdjacentTo } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";

const Body = z.object({
  conversationId: z.string().min(1),
  targetId: z.string().min(1),
  zone: z.enum(["before", "after"]),
});

export async function handleReorder(req: Request): Promise<Response> {
  const { conversationId, targetId, zone } = Body.parse(await req.json());
  if (conversationId === targetId) return Response.json({ ok: true });
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  const rank = await rankAdjacentTo(targetId, zone);
  await conversationsQueue.upsert(conversationId, { rank: rank.toJSON() });
  queueRanksResource.notify();
  return Response.json({ ok: true });
}
