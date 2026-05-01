import { z } from "zod";
import {
  recentConversationsResource,
  updateConversation,
  getConversation,
} from "@plugins/tasks-core/server";

const Body = z.object({
  conversationId: z.string().min(1),
  rank: z.string().min(1).max(256),
});

export async function handleReorder(req: Request): Promise<Response> {
  const { conversationId, rank } = Body.parse(await req.json());
  const conv = await getConversation(conversationId);
  if (!conv) return new Response("Not found", { status: 404 });
  await updateConversation(conversationId, { rank });
  recentConversationsResource.notify();
  return Response.json({ ok: true });
}
