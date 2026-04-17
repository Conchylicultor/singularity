import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { tasks } from "../schema";
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
    parentId?: string | null;
    rank?: string;
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
  if (body.parentId === null || typeof body.parentId === "string") {
    if (body.parentId === id) {
      return new Response("Cannot parent a task to itself", { status: 400 });
    }
    if (body.parentId !== null && (await isDescendant(id, body.parentId))) {
      return new Response("Cannot parent a task under its own descendant", {
        status: 400,
      });
    }
    patch.parentId = body.parentId;
  }
  if (typeof body.rank === "string" && body.rank.length > 0) {
    patch.rank = body.rank;
  }
  const [updated] = await db
    .update(_tasks)
    .set(patch)
    .where(eq(_tasks.id, id))
    .returning({ id: _tasks.id });
  if (!updated) return new Response("Not found", { status: 404 });
  if (typeof body.parentId === "string" && body.parentId.length > 0) {
    await db
      .update(_tasks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_tasks.id, body.parentId));
  }
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  tasksResource.notify();
  return Response.json(row);
}

async function isDescendant(ancestorId: string, candidateId: string): Promise<boolean> {
  const all = await db
    .select({ id: _tasks.id, parentId: _tasks.parentId })
    .from(_tasks);
  const byId = new Map(all.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur) ?? null;
  }
  return false;
}
