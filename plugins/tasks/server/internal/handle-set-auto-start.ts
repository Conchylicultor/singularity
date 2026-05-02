import { z } from "zod";
import { getTask } from "@plugins/tasks-core/server";
import { armTaskAutoStart } from "./arm-auto-start";

const ModelSchema = z.enum(["opus", "sonnet"]);

export async function handleSetAutoStart(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const taskId = params.id;
  if (!taskId) return new Response("missing task id", { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = ModelSchema.safeParse(body?.model);
  if (!parsed.success) {
    return new Response("invalid model — must be 'opus' or 'sonnet'", { status: 400 });
  }

  const task = await getTask(taskId);
  if (!task) return new Response("Not found", { status: 404 });

  // Route through armTaskAutoStart (not setTaskAutoStart) so per-dep oneShot
  // triggers get installed — or the job gets enqueued immediately when no
  // deps block. Otherwise the autoStartAt marker would just sit on the row
  // with nothing wired to fire maybeLaunchTaskJob.
  await armTaskAutoStart({
    taskId,
    model: parsed.data,
    dependencies: task.dependencies,
  });
  return new Response(null, { status: 204 });
}
