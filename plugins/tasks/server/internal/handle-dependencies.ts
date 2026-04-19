import { and, eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _taskDependencies, _tasks } from "../schema_internal";
import { tasksResource } from "./resources";

export async function handleAddDependency(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    dependsOnTaskId?: unknown;
  };
  if (typeof body.dependsOnTaskId !== "string" || body.dependsOnTaskId.length === 0) {
    return new Response("Missing dependsOnTaskId", { status: 400 });
  }
  const depId = body.dependsOnTaskId;
  if (depId === id) {
    return new Response("A task cannot depend on itself", { status: 400 });
  }

  const [task] = await db.select({ id: _tasks.id }).from(_tasks).where(eq(_tasks.id, id)).limit(1);
  if (!task) return new Response("Task not found", { status: 404 });
  const [dep] = await db.select({ id: _tasks.id }).from(_tasks).where(eq(_tasks.id, depId)).limit(1);
  if (!dep) return new Response("Dependency task not found", { status: 404 });

  if (await dependsOn(depId, id)) {
    return new Response("Cycle detected in dependencies", { status: 400 });
  }

  await db
    .insert(_taskDependencies)
    .values({ taskId: id, dependsOnTaskId: depId })
    .onConflictDoNothing();
  tasksResource.notify();
  return new Response(null, { status: 204 });
}

export async function handleRemoveDependency(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  const depId = params.depId;
  if (!id || !depId) return new Response("Missing id", { status: 400 });
  const [row] = await db
    .delete(_taskDependencies)
    .where(
      and(
        eq(_taskDependencies.taskId, id),
        eq(_taskDependencies.dependsOnTaskId, depId),
      ),
    )
    .returning({ taskId: _taskDependencies.taskId });
  if (!row) return new Response("Not found", { status: 404 });
  tasksResource.notify();
  return new Response(null, { status: 204 });
}

// True if `start` (transitively) depends on `target`. Used to prevent cycles
// before inserting `target -> start` (which would close the loop).
async function dependsOn(start: string, target: string): Promise<boolean> {
  const all = await db
    .select({
      taskId: _taskDependencies.taskId,
      dependsOnTaskId: _taskDependencies.dependsOnTaskId,
    })
    .from(_taskDependencies);
  const edges = new Map<string, string[]>();
  for (const e of all) {
    const list = edges.get(e.taskId);
    if (list) list.push(e.dependsOnTaskId);
    else edges.set(e.taskId, [e.dependsOnTaskId]);
  }
  const stack = [start];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = edges.get(cur);
    if (next) stack.push(...next);
  }
  return false;
}
