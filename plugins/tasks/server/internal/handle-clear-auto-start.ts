import { setTaskAutoStart } from "@plugins/tasks-core/server";

// Clear the autoStart columns on a single task. Trigger rows registered for
// the parent stay alive but no-op the next time they fire (the launcher
// scans for autoStartAt-set rows and finds none for this task). Cheaper
// than reverse-walking trigger tables to delete them up-front.
export async function handleClearAutoStart(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const taskId = params.id;
  if (!taskId) return new Response("missing task id", { status: 400 });
  const ok = await setTaskAutoStart(taskId, null);
  if (!ok) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
