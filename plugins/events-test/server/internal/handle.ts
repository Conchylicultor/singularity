import { asc, sql } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { deleteTrigger, trigger } from "@plugins/events/server";
import { actionLog, logPing, resetActionLog } from "./action";
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
    do: logPing({ label: body.label }),
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

export function handleLog(): Response {
  return Response.json({ entries: actionLog });
}

export function handleReset(): Response {
  resetActionLog();
  return Response.json({ ok: true });
}

// Poll graphile_worker.jobs until no jobs for the events dispatch task are
// pending. Lets e2e tests synchronize between emit() (which now returns once
// jobs are durable, not once handlers finish) and /log.
export async function handleWaitIdle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? 2000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM graphile_worker.jobs WHERE task_identifier = 'events.dispatch' AND attempts < max_attempts`,
    );
    const n = (rows[0] as { n: number } | undefined)?.n ?? 0;
    if (n === 0) return Response.json({ idle: true });
    await new Promise((r) => setTimeout(r, 25));
  }
  return Response.json({ idle: false, timeoutMs }, { status: 408 });
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
  await logPing.deleteTargeting({ label: body.label });
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
