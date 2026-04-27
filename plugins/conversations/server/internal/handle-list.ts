import { listConversationsForDisplay } from "@plugins/tasks-core/server";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await listConversationsForDisplay();
  return Response.json(rows);
}
