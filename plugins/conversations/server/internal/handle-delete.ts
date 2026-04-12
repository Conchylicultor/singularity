import { deleteConversation } from "./tmux";

export async function handleDelete(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name || !/^claude-\d+$/.test(name)) {
    return Response.json({ error: "Invalid session name" }, { status: 400 });
  }
  await deleteConversation(name);
  return Response.json({ ok: true });
}
