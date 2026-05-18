import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { startPushAndExit } from "../../shared/endpoints";
import { pushAndExitJob } from "./push-and-exit-job";
import { pushAndExitResource } from "./state";
import { _pushAndExitJobs } from "./tables";

export const handleStart = implement(startPushAndExit, async ({ params }) => {
  const { id } = params;
  const existing = await db
    .select({ status: _pushAndExitJobs.status })
    .from(_pushAndExitJobs)
    .where(eq(_pushAndExitJobs.conversationId, id))
    .limit(1);
  if (existing[0]?.status === "running") {
    throw new HttpError(409, "Already running");
  }
  await db
    .insert(_pushAndExitJobs)
    .values({ conversationId: id, status: "running", detail: null })
    .onConflictDoUpdate({
      target: _pushAndExitJobs.conversationId,
      set: { status: "running", detail: null, updatedAt: new Date() },
    });
  pushAndExitResource.notify();
  await pushAndExitJob.enqueue({ conversationId: id }, { jobKey: id });
  return { ok: true };
});
