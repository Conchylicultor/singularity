import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { sendTurn } from "@plugins/conversations/server";
import { startPushAndExit } from "../../shared/endpoints";
import { PUSH_AND_EXIT_PROMPT } from "./prompt";
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
  await sendTurn(id, PUSH_AND_EXIT_PROMPT);
  return { ok: true };
});
