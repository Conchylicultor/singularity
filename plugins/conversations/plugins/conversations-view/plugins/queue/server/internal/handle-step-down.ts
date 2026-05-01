import { z } from "zod";
import {
  recentConversationsResource,
  updateConversation,
  getConversation,
} from "@plugins/tasks-core/server";
import { rankAfterN } from "./queue-ranks";

const Body = z.object({ conversationId: z.string().min(1), steps: z.number().int().positive() });

export async function handleStepDown(req: Request): Promise<Response> {
  const { conversationId, steps } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  const rank = await rankAfterN(conversationId, steps);
  await updateConversation(conversationId, { rank });
  recentConversationsResource.notify();
  return Response.json({ ok: true });
}
