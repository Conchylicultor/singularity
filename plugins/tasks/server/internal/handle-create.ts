import {
  addTaskDependency,
  createTask,
  getTask,
} from "@plugins/tasks-core/server";
import { armTaskAutoStart } from "./arm-auto-start";

interface AutoStartInput {
  model?: "opus" | "sonnet";
}

interface CreateBody {
  parentId?: string | null;
  title?: string;
  author?: string;
  rank?: string;
  dependencies?: string[];
  autoStart?: AutoStartInput;
}

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const row = await createTask({
    parentId: body.parentId ?? null,
    title: body.title ?? "Untitled",
    author: body.author ?? "user",
    rank: body.rank,
  });

  const dependencies = Array.isArray(body.dependencies)
    ? Array.from(
        new Set(
          body.dependencies.filter(
            (d): d is string => typeof d === "string" && d.length > 0 && d !== row.id,
          ),
        ),
      )
    : [];

  for (const depId of dependencies) {
    try {
      await addTaskDependency(row.id, depId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bad request";
      const status = msg.includes("not found") ? 404 : 400;
      return new Response(msg, { status });
    }
  }

  if (body.autoStart) {
    await armTaskAutoStart({
      taskId: row.id,
      model: body.autoStart.model ?? "sonnet",
      dependencies,
    });
    // Re-fetch so the response reflects the autoStart columns and any
    // dependencies we just wrote.
    const fresh = await getTask(row.id);
    return Response.json(fresh ?? row);
  }

  if (dependencies.length > 0) {
    const fresh = await getTask(row.id);
    return Response.json(fresh ?? row);
  }

  return Response.json(row);
}
