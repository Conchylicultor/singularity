import { z } from "zod";
import { upsertExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { getConversation } from "@plugins/tasks-core/server";
import { rankForTop } from "./queue-ranks";
import { _conversationsExtQueue } from "./tables";
import { queueRanksResource } from "./resource";

const Body = z.object({ conversationId: z.string().min(1) });

export async function handlePromote(req: Request): Promise<Response> {
  const { conversationId } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  const rank = await rankForTop(conversationId);
  await upsertExtension(_conversationsExtQueue, conversationId, { rank });
  queueRanksResource.notify();
  return Response.json({ ok: true });
}
