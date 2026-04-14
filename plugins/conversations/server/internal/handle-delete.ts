import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { conversations } from "../schema";
import { deleteConversation } from "./lifecycle";
import { broadcast } from "./sse";

export async function handleDelete(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name || !/^claude-\d+$/.test(name)) {
    return Response.json({ error: "Invalid session name" }, { status: 400 });
  }
  await deleteConversation(name);
  await db.delete(conversations).where(eq(conversations.id, name));
  broadcast({ type: "deleted", id: name });
  return Response.json({ ok: true });
}
