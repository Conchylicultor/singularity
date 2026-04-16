import { db } from "../../../../server/src/db/client";
import { _tasks } from "../schema_internal";
import { tasksResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    title?: string;
  };
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(_tasks)
    .values({
      id,
      parentId: body.parentId ?? null,
      title: body.title ?? "Untitled",
    })
    .returning();
  tasksResource.notify();
  return Response.json(row);
}
