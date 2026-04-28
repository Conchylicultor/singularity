import {
  addTaskDependency,
  createTask,
  getTask,
  hasBlockingDep,
  setTaskAutoStart,
  taskStatusChanged,
} from "@plugins/tasks-core/server";
import { triggerByName } from "@plugins/infra/plugins/events/server";
import { UNSAFE_getRegisteredJob } from "@plugins/infra/plugins/jobs/server";

const MAYBE_LAUNCH_JOB = "tasks.maybe-launch";

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
    const model = body.autoStart.model ?? "sonnet";
    await setTaskAutoStart(row.id, { model });

    if (await hasBlockingDep(row.id)) {
      // Per-dep oneShot triggers: fire on done (the typical unblock path) and
      // on dropped (also non-blocking per the tasks_v derivation). Held deps
      // don't fire — the task stays blocked until the user un-holds and the
      // dep eventually reaches done. Multiple deps stack: each one fires
      // maybe-launch, the job re-checks hasBlockingDep, and only the last
      // unblocking transition actually launches.
      for (const depId of dependencies) {
        await triggerByName({
          on: taskStatusChanged.where({ taskId: depId, status: "done" }),
          jobName: MAYBE_LAUNCH_JOB,
          with: { taskId: row.id },
          oneShot: true,
        });
        await triggerByName({
          on: taskStatusChanged.where({ taskId: depId, status: "dropped" }),
          jobName: MAYBE_LAUNCH_JOB,
          with: { taskId: row.id },
          oneShot: true,
        });
      }
    } else {
      // No blocking deps — either no deps at all, or every dep was already
      // done/dropped at queue time. Enqueue immediately rather than arm
      // triggers that would never fire.
      const job = UNSAFE_getRegisteredJob(MAYBE_LAUNCH_JOB);
      if (job) await job.enqueue({ taskId: row.id });
    }
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
