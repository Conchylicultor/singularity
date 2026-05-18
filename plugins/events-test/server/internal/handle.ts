import { asc, sql } from "drizzle-orm";
import { deleteTrigger, deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  subscribeEventsTest,
  emitEventsTest,
  directEnqueueEventsTest,
  getEventsTestLog,
  resetEventsTest,
  deleteEventsTestTrigger,
  deleteEventsTestTargeting,
  listEventsTestTriggers,
} from "../../shared/endpoints";
import { logEntries, logPing, resetLog } from "./log-job";
import { _pingedTriggers, pinged } from "./tables";

export const handleSubscribe = implement(subscribeEventsTest, async ({ body }) => {
  const source = body.userId ? pinged.where({ userId: body.userId }) : pinged;
  const id = await trigger({
    on: source,
    do: logPing,
    with: { label: body.label },
    oneShot: body.oneShot ?? true,
  });
  return { id };
});

export const handleEmit = implement(emitEventsTest, async ({ body }) => {
  await pinged.emit({
    userId: body.userId,
    message: body.message ?? "hello",
  });
  return { ok: true };
});

// Exercises the Layer-1 `.enqueue()` path: no trigger row is involved, the
// job runs straight from graphile_worker.jobs. The handler logs `label` from
// input and defaults the event-only fields (userId/message) to
// "direct"/"direct-enqueued", since direct enqueue has no event source.
export const handleDirectEnqueue = implement(directEnqueueEventsTest, async ({ body }) => {
  const { jobId } = await logPing.enqueue({ label: body.label });
  return { jobId };
});

export const handleLog = implement(getEventsTestLog, () => {
  return { entries: logEntries };
});

export const handleReset = implement(resetEventsTest, () => {
  resetLog();
  return { ok: true };
});

// Poll graphile_worker.jobs until no jobs for the shared jobs.run task are
// pending. Lets e2e tests synchronize between emit()/enqueue() (which now
// return once jobs are durable, not once handlers finish) and /log.
// NOTE: Not using implement() because retryUntil returns a raw Response.
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

export const handleDeleteTrigger = implement(deleteEventsTestTrigger, async ({ params }) => {
  const { id } = params;
  if (!id) throw new HttpError(400, "id required");
  await deleteTrigger(id);
  return { ok: true };
});

export const handleDeleteTargeting = implement(deleteEventsTestTargeting, async ({ body }) => {
  await deleteTriggersFor(logPing, { label: body.label });
  return { ok: true };
});

export const handleListTriggers = implement(listEventsTestTriggers, async () => {
  const rows = await db
    .select()
    .from(_pingedTriggers)
    // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on base-columns.
    .orderBy(asc((_pingedTriggers as any).createdAt));
  return { rows };
});
