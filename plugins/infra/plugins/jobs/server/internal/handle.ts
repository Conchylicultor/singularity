import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listJobs, retryJob, cancelJob } from "../../core/endpoints";
import { getWorkerUtils } from "./worker";
import { loadJobsList, jobsListResource } from "./resources";

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

export const handleRetryJob = implement(retryJob, async ({ params }) => {
  if (!params.id) throw new HttpError(400, "id required");
  const utils = await getWorkerUtils();
  await utils.rescheduleJobs([params.id], { attempts: 0, runAt: new Date() });
  jobsListResource.notify();
  return { ok: true };
});

export const handleCancelJob = implement(cancelJob, async ({ params }) => {
  if (!params.id) throw new HttpError(400, "id required");
  const utils = await getWorkerUtils();
  await utils.completeJobs([params.id]);
  jobsListResource.notify();
  return { ok: true };
});
