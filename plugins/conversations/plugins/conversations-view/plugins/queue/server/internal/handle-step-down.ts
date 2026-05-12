import { z } from "zod";
import { getConversation } from "@plugins/tasks-core/server";
import { rankAfterN } from "./queue-ranks";
import { conversationsQueue } from "./tables";
import { queueRanksResource } from "./resource";
import { getPinnedId, setPinnedId, topWaitingByRank, validatePin } from "./pinned";

const Body = z.object({ conversationId: z.string().min(1), steps: z.number().int().positive() });

export async function handleStepDown(req: Request): Promise<Response> {
  const { conversationId, steps } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  const rank = await rankAfterN(conversationId, steps);
  await conversationsQueue.upsert(conversationId, { rank: rank.toJSON() });
  // If the stepped-down conversation was pinned, advance the pin to the next in line.
  // validatePin() alone won't help because the conversation is still waiting.
  const pinnedId = await getPinnedId();
  if (pinnedId === conversationId) {
    const nextId = await topWaitingByRank(conversationId);
    await setPinnedId(nextId ?? conversationId);
  } else {
    await validatePin();
  }
  queueRanksResource.notify();
  return Response.json({ ok: true });
}
