import { sql } from "drizzle-orm";
import { db } from "@server/db/client";
import { JOB_TASK } from "./constants";
import { getWorkerUtils } from "./worker";

// Graphile row as returned by raw SQL — field names are snake_case.
interface GraphileJobRow {
  id: string;
  task_identifier: string;
  payload: { jobName?: string; input?: unknown } | null;
  queue_name: string | null;
  priority: number;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

type JobState = "running" | "dead" | "retrying" | "pending";

function deriveState(row: GraphileJobRow): JobState {
  if (row.locked_at !== null) return "running";
  if (row.attempts >= row.max_attempts) return "dead";
  if (row.attempts > 0) return "retrying";
  return "pending";
}

export async function handleListJobs(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") as JobState | "all" | null;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  // graphile_worker.jobs is a view that omits `payload` (payload lives on the
  // underlying _private_jobs table). Join in task_identifier + queue_name to
  // get the same shape the public view exposes, plus payload.
  const result = await db.execute(
    sql`SELECT j.id::text,
               t.identifier AS task_identifier,
               j.payload,
               q.queue_name,
               j.priority,
               j.run_at, j.locked_at, j.locked_by,
               j.attempts, j.max_attempts, j.last_error,
               j.created_at, j.updated_at
          FROM graphile_worker._private_jobs j
          JOIN graphile_worker._private_tasks t ON t.id = j.task_id
     LEFT JOIN graphile_worker._private_job_queues q ON q.id = j.job_queue_id
         WHERE t.identifier = ${JOB_TASK}
         ORDER BY j.run_at DESC
         LIMIT ${limit}`,
  );

  const out = (result.rows as unknown as GraphileJobRow[]).map((r) => ({
    id: r.id,
    jobName: r.payload?.jobName ?? "(unknown)",
    input: r.payload?.input ?? null,
    state: deriveState(r),
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAt: r.run_at,
    lockedAt: r.locked_at,
    lockedBy: r.locked_by,
    queueName: r.queue_name,
    priority: r.priority,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const filtered = state && state !== "all" ? out.filter((j) => j.state === state) : out;
  const counts = {
    pending: 0,
    running: 0,
    retrying: 0,
    dead: 0,
  } satisfies Record<JobState, number>;
  for (const j of out) counts[j.state]++;

  return Response.json({ rows: filtered, counts });
}

export async function handleRetryJob(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const utils = await getWorkerUtils();
  // Reset attempts so the worker picks it up as fresh; runAt=now kicks it off
  // immediately. Works for both retrying (attempts < max) and dead
  // (attempts >= max) rows.
  await utils.rescheduleJobs([id], { attempts: 0, runAt: new Date() });
  return Response.json({ ok: true });
}

export async function handleCancelJob(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const utils = await getWorkerUtils();
  // completeJobs removes the row from graphile_worker.jobs. No-op if the job
  // has already been picked up and is currently running.
  await utils.completeJobs([id]);
  return Response.json({ ok: true });
}
