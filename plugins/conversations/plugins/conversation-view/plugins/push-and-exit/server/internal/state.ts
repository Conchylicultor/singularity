import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { JobStateSchema, type JobState } from "@plugins/conversations/plugins/conversation-view/plugins/push-and-exit/shared/resources";
import { _pushAndExitJobs } from "./tables";

type Status = JobState["status"];

function rowToState(row: typeof _pushAndExitJobs.$inferSelect): JobState {
  switch (row.status) {
    case "running":
      return { status: "running" };
    case "clean":
      return { status: "clean" };
    case "flag":
      return { status: "flag", text: row.detail ?? "" };
    case "error":
      return { status: "error", message: row.detail ?? "" };
  }
}

export const pushAndExitResource = defineResource({
  key: "push-and-exit",
  mode: "push",
  schema: z.record(JobStateSchema),
  loader: async (): Promise<Record<string, JobState>> => {
    const rows = await db.select().from(_pushAndExitJobs);
    return Object.fromEntries(rows.map((r) => [r.conversationId, rowToState(r)]));
  },
});

export async function setStatus(
  conversationId: string,
  status: Status,
  detail: string | null,
): Promise<void> {
  await db
    .update(_pushAndExitJobs)
    .set({ status, detail, updatedAt: new Date() })
    .where(eq(_pushAndExitJobs.conversationId, conversationId));
  pushAndExitResource.notify();
}

// Returns null if the job row is gone (e.g. user clicked the DELETE
// cleanup endpoint after a terminal state). Callers should treat null as
// "no in-flight push-and-exit" and bail out.
export async function readStatus(
  conversationId: string,
): Promise<Status | null> {
  const rows = await db
    .select({ status: _pushAndExitJobs.status })
    .from(_pushAndExitJobs)
    .where(eq(_pushAndExitJobs.conversationId, conversationId))
    .limit(1);
  return rows[0]?.status ?? null;
}
