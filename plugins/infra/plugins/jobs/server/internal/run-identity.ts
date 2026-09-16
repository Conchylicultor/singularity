import type { JobTaskPayload } from "./registry";

// The two identities a job row carries, and the one place each is spelled.
//
// · The QUEUE key (graphile's `job_key`) decides which enqueues collapse onto
//   one pending row. A singleton's key is `singletonJobKey(name)`; a keyed
//   dedup's is `${name}:${key}`; `dedup: "none"` has none.
// · The RUN id (`workflowRunId`) keys the step and wait logs (`_jobSteps` /
//   `_jobWaits`) that a durable workflow replays.
//
// They are the same string only for a keyed dedup, where "one run per key" is
// the contract (a second enqueue coalescing into a suspended workflow relies on
// it). For everything else the run is the queue ROW: its id survives a retry, a
// sweeper reclaim, and a later enqueue or cron tick collapsing onto the pending
// row (which replaces its payload but keeps its id). Sharing the singleton key
// as the run id used to let a finished or dead run's log be replayed by the
// next, unrelated run.

/**
 * The graphile `job_key` of a `dedup: "singleton"` job. Shared by `enqueue()`
 * and the cron item, so a manual enqueue and a tick collapse onto the SAME
 * pending row — they must agree byte for byte, and now say so in one place
 * rather than by both happening to spell the run id.
 */
export function singletonJobKey(jobName: string): string {
  return `${jobName}:_`;
}

/**
 * The run id of the row being dispatched. A keyed dedup (and a resume row)
 * bakes its run id into the payload at insertion; every other row is its own
 * run, `${jobName}:job:${jobId}`. Rows queued before this rule existed carry a
 * baked id and keep it.
 */
export function workflowRunIdFor(
  payload: Pick<JobTaskPayload, "jobName" | "workflowRunId">,
  jobId: string,
): string {
  return payload.workflowRunId ?? `${payload.jobName}:job:${jobId}`;
}

/**
 * The run ids whose step/wait logs die with these queue rows — for a sweep
 * that deletes rows no dispatch will ever finish (dead-job GC, the superseded
 * DELETE).
 *
 * Only rows WITHOUT a baked run id own their log. A baked id (a keyed dedup, a
 * resume row) is shared by design with whatever row holds that key next, and a
 * dead or superseded row's key has already been released to such a row — so
 * deleting that log could erase a live workflow's progress. A row-derived id
 * names this row and nothing else.
 */
export function ownedWorkflowRunIds(
  rows: readonly {
    id: string;
    job_name: string;
    baked_run_id: string | null;
  }[],
): string[] {
  return rows
    .filter((row) => row.baked_run_id === null)
    .map((row) => workflowRunIdFor({ jobName: row.job_name }, row.id));
}
