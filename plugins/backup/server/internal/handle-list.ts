import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listBackupRuns } from "../../shared/endpoints";
import { _backupRuns } from "./tables";

export const handleList = implement(listBackupRuns, async () => {
  const runs = await db
    .select()
    .from(_backupRuns)
    .orderBy(desc(_backupRuns.startedAt))
    .limit(50);
  return runs;
});
