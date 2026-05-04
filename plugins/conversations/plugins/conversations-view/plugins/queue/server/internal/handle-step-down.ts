import { z } from "zod";
import { getConversation } from "@plugins/tasks-core/server";
import { rankAfterN } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";

const Body = z.object({ conversationId: z.string().min(1), steps: z.number().int().positive() });

export async function handleStepDown(req: Request): Promise<Response> {
  const { conversationId, steps } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  const rank = await rankAfterN(conversationId, steps);
  await conversationsQueue.upsert(conversationId, { rank: rank.toJSON() });
  queueRanksResource.notify();
  return Response.json({ ok: true });
}
