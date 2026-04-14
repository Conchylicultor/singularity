import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { tasks } from "../schema";

const ALLOWED_STATUSES = new Set(["todo", "in_progress", "done", "cancelled"]);

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string | null;
    status?: string;
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title;
  if (body.description === null || typeof body.description === "string") {
    patch.description = body.description;
  }
  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return new Response("Invalid status", { status: 400 });
    }
    patch.status = body.status;
  }
  const [row] = await db
    .update(tasks)
    .set(patch)
    .where(eq(tasks.id, id))
    .returning();
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(row);
}
