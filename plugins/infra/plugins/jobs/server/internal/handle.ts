import { getWorkerUtils } from "./worker";
import { loadJobsList, jobsListResource } from "./resources";

export async function handleListJobs(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  const payload = await loadJobsList(limit);
  if (state && state !== "all") {
    return Response.json({
      rows: payload.rows.filter((j) => j.state === state),
      counts: payload.counts,
    });
  }
  return Response.json(payload);
}

export async function handleRetryJob(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const utils = await getWorkerUtils();
  await utils.rescheduleJobs([id], { attempts: 0, runAt: new Date() });
  jobsListResource.notify();
  return Response.json({ ok: true });
}

export async function handleCancelJob(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const utils = await getWorkerUtils();
  await utils.completeJobs([id]);
  jobsListResource.notify();
  return Response.json({ ok: true });
}
