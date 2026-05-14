import { backupRunJob } from "./backup-job";

export async function handleRun(): Promise<Response> {
  const { jobId } = await backupRunJob.enqueue({ trigger: "manual" });
  return Response.json({ ok: true, jobId });
}
