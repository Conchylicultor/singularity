import { listTasks } from "@plugins/tasks-core/server";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await listTasks();
  return Response.json(rows);
}
