import { z } from "zod";
import { upsertExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { getConversation } from "@plugins/tasks-core/server";
import { rankAfterN } from "./queue-ranks";
import { _conversationsExtQueue } from "./tables";
import { queueRanksResource } from "./resource";

const Body = z.object({ conversationId: z.string().min(1), steps: z.number().int().positive() });

export async function handleStepDown(req: Request): Promise<Response> {
  const { conversationId, steps } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  const rank = await rankAfterN(conversationId, steps);
  await upsertExtension(_conversationsExtQueue, conversationId, { rank });
  queueRanksResource.notify();
  return Response.json({ ok: true });
}
