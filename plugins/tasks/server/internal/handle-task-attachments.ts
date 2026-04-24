import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { _attachments } from "@plugins/attachments/server";
import { _taskAttachments } from "@plugins/tasks-core/server";

export async function handleTaskAttachments(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const taskId = params.id;
  if (!taskId) return new Response("missing task id", { status: 400 });
  const rows = await db
    .select({
      id: _attachments.id,
      filename: _attachments.filename,
      mime: _attachments.mime,
      size: _attachments.size,
      createdAt: _attachments.createdAt,
    })
    .from(_taskAttachments)
    .innerJoin(_attachments, eq(_attachments.id, _taskAttachments.attachmentId))
    .where(eq(_taskAttachments.ownerId, taskId));
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mime: r.mime,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}
