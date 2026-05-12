import { asc, sql } from "drizzle-orm";
import { deleteTrigger, deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { db } from "@plugins/database/server";
import { logEntries, logPing, resetLog } from "./log-job";
import { _pingedTriggers, pinged } from "./tables";

interface SubscribeBody {
  userId?: string;
  label: string;
  oneShot?: boolean;
}

export async function handleSubscribe(req: Request): Promise<Response> {
  const body = (await req.json()) as SubscribeBody;
  if (typeof body.label !== "string") {
    return Response.json({ error: "label (string) required" }, { status: 400 });
  }
  const source = body.userId ? pinged.where({ userId: body.userId }) : pinged;
  const id = await trigger({
    on: source,
    do: logPing,
    with: { label: body.label },
    oneShot: body.oneShot ?? true,
  });
  return Response.json({ id });
}

interface EmitBody {
  userId: string;
  message?: string;
}

export async function handleEmit(req: Request): Promise<Response> {
  const body = (await req.json()) as EmitBody;
  if (typeof body.userId !== "string") {
    return Response.json({ error: "userId (string) required" }, { status: 400 });
  }
  await pinged.emit({
    userId: body.userId,
    message: body.message ?? "hello",
  });
  return Response.json({ ok: true });
}

interface DirectEnqueueBody {
  label: string;
}

// Exercises the Layer-1 `.enqueue()` path: no trigger row is involved, the
// job runs straight from graphile_worker.jobs. The handler logs `label` from
// input and defaults the event-only fields (userId/message) to
// "direct"/"direct-enqueued", since direct enqueue has no event source.
export async function handleDirectEnqueue(req: Request): Promise<Response> {
  const body = (await req.json()) as DirectEnqueueBody;
  if (typeof body.label !== "string") {
    return Response.json({ error: "label (string) required" }, { status: 400 });
  }
  const { jobId } = await logPing.enqueue({ label: body.label });
  return Response.json({ jobId });
}

export function handleLog(): Response {
  return Response.json({ entries: logEntries });
}

export function handleReset(): Response {
  resetLog();
  return Response.json({ ok: true });
}

// Poll graphile_worker.jobs until no jobs for the shared jobs.run task are
// pending. Lets e2e tests synchronize between emit()/enqueue() (which now
// return once jobs are durable, not once handlers finish) and /log.
export async function handleWaitIdle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? 2000);
  return retryUntil(
    async () => {
      const result = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM graphile_worker.jobs WHERE task_identifier = 'jobs.run' AND attempts < max_attempts`,
      );
      const n = result.rows[0]?.n ?? 0;
      return n === 0 ? Response.json({ idle: true }) : null;
    },
    {
      delay: fixed(25),
      deadline: timeoutMs,
      onDeadline: () => Response.json({ idle: false, timeoutMs }, { status: 408 }),
    },
  );
}

export async function handleDeleteTrigger(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteTrigger(id);
  return Response.json({ ok: true });
}

interface DeleteTargetingBody {
  label: string;
}

export async function handleDeleteTargeting(req: Request): Promise<Response> {
  const body = (await req.json()) as DeleteTargetingBody;
  if (typeof body.label !== "string") {
    return Response.json({ error: "label (string) required" }, { status: 400 });
  }
  await deleteTriggersFor(logPing, { label: body.label });
  return Response.json({ ok: true });
}

export async function handleListTriggers(): Promise<Response> {
  const rows = await db
    .select()
    .from(_pingedTriggers)
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on base-columns.
    .orderBy(asc((_pingedTriggers as any).createdAt));
  return Response.json({ rows });
}
