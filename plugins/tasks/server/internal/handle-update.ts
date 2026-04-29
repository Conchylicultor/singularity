import { _taskAttachments, updateTask } from "@plugins/tasks-core/server";
import { syncOwnerAttachments } from "@plugins/infra/plugins/attachments/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/paste-images/shared";

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string | null;
    drop?: boolean;
    hold?: boolean;
    expanded?: boolean;
    parentId?: string | null;
    rank?: string;
  };
  let row;
  try {
    row = await updateTask(id, body);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Bad request", {
      status: 400,
    });
  }
  if (!row) return new Response("Not found", { status: 404 });

  // Description is the only text column that can carry attachment refs today.
  // Reconcile the task's link rows against the ids referenced in the new
  // description; the orphan sweep collects any attachment that loses its last
  // link.
  if (typeof body.description === "string" || body.description === null) {
    const ids = body.description ? extractAttachmentIds(body.description) : [];
    await syncOwnerAttachments(_taskAttachments, id, ids);
  }
  return Response.json(row);
}
