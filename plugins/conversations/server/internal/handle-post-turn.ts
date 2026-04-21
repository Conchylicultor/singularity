import { getConversationRuntime } from "@plugins/tasks-core/server";
import { Runtime } from "./runtime";

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

  const row = await getConversationRuntime(id);
  if (!row) return new Response("Not found", { status: 404 });

  await Runtime.get(row.runtime).send(id, body.text);
  return Response.json({ ok: true });
}
