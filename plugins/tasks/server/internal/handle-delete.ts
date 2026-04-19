import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _tasks } from "./tables";
import { tasksResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const children = await db
    .select({ id: _tasks.id })
    .from(_tasks)
    .where(eq(_tasks.parentId, id))
    .limit(1);
  if (children.length > 0) {
    return new Response("Task has children", { status: 409 });
  }
  const [row] = await db.delete(_tasks).where(eq(_tasks.id, id)).returning();
  if (!row) return new Response("Not found", { status: 404 });
  tasksResource.notify();
  return new Response(null, { status: 204 });
}
