import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { cancelPushAndExit } from "../../shared/endpoints";
import { pushAndExitResource } from "./state";
import { _pushAndExitJobs } from "./tables";

export const handleCancel = implement(cancelPushAndExit, async ({ params }) => {
  await db.delete(_pushAndExitJobs).where(eq(_pushAndExitJobs.conversationId, params.id));
  pushAndExitResource.notify();
  return { ok: true };
});
