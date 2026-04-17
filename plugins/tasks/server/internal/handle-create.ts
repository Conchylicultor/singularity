import { db } from "../../../../server/src/db/client";
import { _tasks } from "../schema_internal";
import { nextRankUnder } from "./rank";
import { tasksResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    title?: string;
  };
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  const rank = await nextRankUnder(parentId);
  const [row] = await db
    .insert(_tasks)
    .values({
      id,
      parentId,
      title: body.title ?? "Untitled",
      rank,
    })
    .returning();
  if (parentId) {
    await db
      .update(_tasks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_tasks.id, parentId));
  }
  tasksResource.notify();
  return Response.json(row);
}
