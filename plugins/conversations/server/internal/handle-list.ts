import { listConversations } from "@plugins/tasks-core/server";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await listConversations();
  return Response.json(rows);
}
