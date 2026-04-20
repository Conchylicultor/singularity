import { getConversation } from "@plugins/tasks-core/server";

export async function handleGet(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const row = await getConversation(id);
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(row);
}
