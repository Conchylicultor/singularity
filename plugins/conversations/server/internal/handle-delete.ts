import { deleteConversationRow } from "@plugins/tasks-core/server";
import { deleteConversation } from "./lifecycle";

export async function handleDelete(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name || !/^claude-\d+(-[a-z0-9]+)?$/.test(name)) {
    return Response.json({ error: "Invalid session name" }, { status: 400 });
  }
  await deleteConversation(name);
  await deleteConversationRow(name);
  return Response.json({ ok: true });
}
