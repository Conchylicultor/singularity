import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { Runtime } from "../api";
import { _conversations } from "./tables";

export async function handlePostTurn(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof body.text !== "string" || body.text.length === 0) {
    return Response.json({ error: "body.text required" }, { status: 400 });
  }

  const [row] = await db
    .select({ runtime: _conversations.runtime })
    .from(_conversations)
    .where(eq(_conversations.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  await Runtime.get(row.runtime).send(id, body.text);
  return Response.json({ ok: true });
}
