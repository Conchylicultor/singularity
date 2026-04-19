import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _conversations } from "./tables";
import { deleteConversation } from "./lifecycle";
import { conversationsResource } from "./resources";

export async function handleDelete(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name || !/^claude-\d+(-[a-z0-9]+)?$/.test(name)) {
    return Response.json({ error: "Invalid session name" }, { status: 400 });
  }
  await deleteConversation(name);
  await db.delete(_conversations).where(eq(_conversations.id, name));
  conversationsResource.notify();
  return Response.json({ ok: true });
}
