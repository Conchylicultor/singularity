import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _backupRuns } from "./tables";

export async function handleList(): Promise<Response> {
  const runs = await db
    .select()
    .from(_backupRuns)
    .orderBy(desc(_backupRuns.startedAt))
    .limit(50);
  return Response.json(runs);
}
