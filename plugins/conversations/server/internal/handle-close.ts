import { deleteConversation } from "./lifecycle";
import { markConversationClosed, notifyConversationsChanged } from "@plugins/tasks-core/server";

export async function handleClose(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  await markConversationClosed(id);
  await deleteConversation(id);
  notifyConversationsChanged();
  return Response.json({ ok: true });
}
