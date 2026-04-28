import { setTaskAutoStart } from "@plugins/tasks-core/server";

// Clear the autoStart columns on a single task. Per-dep trigger rows stay
// alive but no-op when they fire (maybe-launch reads autoStartAt and exits
// early if it's null). Cheaper than reverse-walking trigger tables to
// delete them up-front.
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
