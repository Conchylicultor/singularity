import { taskAttachments } from "@plugins/tasks-core/server";

export async function handleTaskAttachments(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const taskId = params.id;
  if (!taskId) return new Response("missing task id", { status: 400 });
  const rows = await taskAttachments.list(taskId);
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mime: r.mime,
      size: r.size,
      createdAt: r.createdAt,
    })),
  );
}
