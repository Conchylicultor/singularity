import { desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "../../../../server/src/db/client";
import { _tasks } from "../schema_internal";
import { tasksResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    title?: string;
  };
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  const [last] = await db
    .select({ rank: _tasks.rank })
    .from(_tasks)
    .where(parentId === null ? isNull(_tasks.parentId) : eq(_tasks.parentId, parentId))
    .orderBy(desc(_tasks.rank))
    .limit(1);
  const rank = generateKeyBetween(last?.rank ?? null, null);
  const [row] = await db
    .insert(_tasks)
    .values({
      id,
      parentId,
      title: body.title ?? "Untitled",
      rank,
    })
    .returning();
  tasksResource.notify();
  return Response.json(row);
}
