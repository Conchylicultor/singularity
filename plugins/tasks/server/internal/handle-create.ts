import {
  createTask,
  getTask,
  setTaskAutoStart,
  taskStatusChanged,
} from "@plugins/tasks-core/server";
import { triggerByName } from "@plugins/infra/plugins/events/server";

const LAUNCH_JOB = "tasks.launch-queued-children";
const CANCEL_JOB = "tasks.cancel-queued-children";

interface AutoStartInput {
  model?: "opus" | "sonnet";
}

interface CreateBody {
  parentId?: string | null;
  title?: string;
  author?: string;
  rank?: string;
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

  if (body.autoStart && body.parentId) {
    const model = body.autoStart.model ?? "sonnet";
    const parent = await getTask(body.parentId);
    if (parent && parent.status === "done") {
      // Parent already finished — fire the launcher immediately rather than
      // arming a trigger that will never see another transition. The job
      // takes the same shape as the trigger-driven path so behavior stays
      // consistent across the two routes.
      await setTaskAutoStart(row.id, { model });
      const { UNSAFE_getRegisteredJob } = await import(
        "@plugins/infra/plugins/jobs/server"
      );
      const job = UNSAFE_getRegisteredJob(LAUNCH_JOB);
      if (job) {
        await job.enqueue({ parentTaskId: body.parentId });
      }
    } else if (
      parent &&
      (parent.status === "dropped" || parent.status === "held")
    ) {
      // Parent is parked. Don't auto-start — leave the child as a plain
      // task; the user can manually launch later.
    } else {
      await setTaskAutoStart(row.id, { model });
      // Three triggers per queue action — done = launch, dropped/held = cancel.
      // All oneShot: true. Multiple queued siblings stack triggers (one set
      // per call); the launcher and canceller jobs both iterate every queued
      // child of the parent and clear markers, so duplicate firings no-op.
      await triggerByName({
        on: taskStatusChanged.where({ taskId: body.parentId, status: "done" }),
        jobName: LAUNCH_JOB,
        with: { parentTaskId: body.parentId },
        oneShot: true,
      });
      await triggerByName({
        on: taskStatusChanged.where({ taskId: body.parentId, status: "dropped" }),
        jobName: CANCEL_JOB,
        with: { parentTaskId: body.parentId },
        oneShot: true,
      });
      await triggerByName({
        on: taskStatusChanged.where({ taskId: body.parentId, status: "held" }),
        jobName: CANCEL_JOB,
        with: { parentTaskId: body.parentId },
        oneShot: true,
      });
    }
    // Re-fetch so the response reflects the autoStart columns we just
    // wrote (clients use this to render the queued chip immediately
    // without waiting for the resource push).
    const fresh = await getTask(row.id);
    return Response.json(fresh ?? row);
  }

  return Response.json(row);
}
