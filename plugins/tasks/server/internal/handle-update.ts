import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _tasks } from "../schema_internal";
import { tasksResource } from "./resources";

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
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title;
  if (body.description === null || typeof body.description === "string") {
    patch.description = body.description;
  }
  if (typeof body.drop === "boolean") {
    patch.droppedAt = body.drop ? new Date() : null;
    if (body.drop) patch.heldAt = null;
  }
  if (typeof body.hold === "boolean") {
    patch.heldAt = body.hold ? new Date() : null;
    if (body.hold) patch.droppedAt = null;
  }
  if (typeof body.expanded === "boolean") patch.expanded = body.expanded;
  const [row] = await db
    .update(_tasks)
    .set(patch)
    .where(eq(_tasks.id, id))
    .returning();
  if (!row) return new Response("Not found", { status: 404 });
  tasksResource.notify();
  return Response.json(row);
}
