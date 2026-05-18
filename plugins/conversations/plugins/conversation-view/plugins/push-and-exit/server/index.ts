import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { exitCleanFinalizeJob } from "./internal/exit-clean-finalize-job";
import { exitCleanTool, flagRaiseTool } from "./internal/mcp-tools";
import { pushAndExitJob } from "./internal/push-and-exit-job";
import { pushAndExitResource } from "./internal/state";
import { _pushAndExitJobs } from "./internal/tables";
import { handleStart } from "./internal/handle-start";
import { handleCancel } from "./internal/handle-cancel";
import { startPushAndExit, cancelPushAndExit } from "../shared/endpoints";

export default {
  id: "push-and-exit",
  name: "Push and Exit",
  contributions: [Resource.Declare(pushAndExitResource)],
  onReady: async () => {
    const stale = await db
      .select({ id: _pushAndExitJobs.conversationId })
      .from(_pushAndExitJobs)
      .where(eq(_pushAndExitJobs.status, "running"));
    if (stale.length > 0) {
      await db
        .update(_pushAndExitJobs)
        .set({
          status: "error" as const,
          detail: "Server restarted while push was in progress.",
          updatedAt: new Date(),
        })
        .where(eq(_pushAndExitJobs.status, "running"));
      pushAndExitResource.notify();
    }
  },
  httpRoutes: {
    [startPushAndExit.route]:  handleStart,
    [cancelPushAndExit.route]: handleCancel,
  },
  register: [pushAndExitJob, exitCleanFinalizeJob, exitCleanTool, flagRaiseTool],
} satisfies ServerPluginDefinition;
