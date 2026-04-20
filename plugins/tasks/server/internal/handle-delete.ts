import { deleteTask } from "@plugins/tasks-core/server";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  let found;
  try {
    found = await deleteTask(id);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Conflict", {
      status: 409,
    });
  }
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
