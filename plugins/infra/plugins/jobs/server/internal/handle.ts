import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  listJobs,
  listDeadJobs,
  retryJob,
  cancelJob,
} from "../../core/endpoints";
import { getWorkerUtils } from "./worker";
import { loadJobsList, loadDeadJobsList } from "./resources";
import { emitQueueActivity } from "./slot-ledger";

export const handleListJobs = implement(listJobs, async ({ req }) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  const payload = await loadJobsList(limit);
  if (state && state !== "all") {
    return {
      rows: payload.rows.filter((j) => j.state === state),
      counts: payload.counts,
    };
  }
  return payload;
});

export const handleListDeadJobs = implement(listDeadJobs, async ({ req }) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 2000), 2000);
  return loadDeadJobsList(limit);
});

export const handleRetryJob = implement(retryJob, async ({ params }) => {
  if (!params.id) throw new HttpError(400, "id required");
  const utils = await getWorkerUtils();
  await utils.rescheduleJobs([params.id], { attempts: 0, runAt: new Date() });
  // graphile_worker is outside the public-schema change-feed, and a reschedule
  // sends no `jobs:insert` → announce it (jobs-list and every other queue
  // reader listen on this one signal).
  emitQueueActivity();
});

export const handleCancelJob = implement(cancelJob, async ({ params }) => {
  if (!params.id) throw new HttpError(400, "id required");
  const utils = await getWorkerUtils();
  await utils.completeJobs([params.id]);
  // graphile_worker is outside the public-schema change-feed, and a delete
  // sends no notification → announce it.
  emitQueueActivity();
});
