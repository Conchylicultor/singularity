import { implement } from "@plugins/infra/plugins/endpoints/server";
import { runBackup } from "../../shared/endpoints";
import { backupRunJob } from "./backup-job";

export const handleRun = implement(runBackup, async () => {
  const { jobId } = await backupRunJob.enqueue({ trigger: "manual" });
  return { ok: true as const, jobId };
});
