import { deleteConversation } from "./lifecycle";

export async function handleClose(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  // Kill the runtime (tmux session) but keep the DB row. The poller will
  // observe the dead pane on its next tick and mark status `gone`.
  await deleteConversation(id);
  return Response.json({ ok: true });
}
