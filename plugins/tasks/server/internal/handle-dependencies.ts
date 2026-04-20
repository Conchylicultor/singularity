import { addTaskDependency, removeTaskDependency } from "@plugins/tasks-core/server";

export async function handleAddDependency(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    dependsOnTaskId?: unknown;
  };
  if (typeof body.dependsOnTaskId !== "string" || body.dependsOnTaskId.length === 0) {
    return new Response("Missing dependsOnTaskId", { status: 400 });
  }
  try {
    await addTaskDependency(id, body.dependsOnTaskId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bad request";
    const status = msg.includes("not found") ? 404 : 400;
    return new Response(msg, { status });
  }
  return new Response(null, { status: 204 });
}

export async function handleRemoveDependency(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  const depId = params.depId;
  if (!id || !depId) return new Response("Missing id", { status: 400 });
  const found = await removeTaskDependency(id, depId);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
