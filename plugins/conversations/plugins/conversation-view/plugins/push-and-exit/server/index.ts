import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { exitCleanFinalizeJob } from "./internal/exit-clean-finalize-job";
import { exitCleanTool, flagRaiseTool } from "./internal/mcp-tools";
import { pushAndExitJob } from "./internal/push-and-exit-job";
import { pushAndExitResource } from "./internal/state";
import { _pushAndExitJobs } from "./internal/tables";

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
    "POST /api/conversations/:id/push-and-exit": async (_req, { id }) => {
      const existing = await db
        .select({ status: _pushAndExitJobs.status })
        .from(_pushAndExitJobs)
        .where(eq(_pushAndExitJobs.conversationId, id))
        .limit(1);
      if (existing[0]?.status === "running") {
        return Response.json({ error: "Already running" }, { status: 409 });
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
      return Response.json({ ok: true }, { status: 202 });
    },
    "DELETE /api/conversations/:id/push-and-exit": async (_req, { id }) => {
      await db.delete(_pushAndExitJobs).where(eq(_pushAndExitJobs.conversationId, id));
      pushAndExitResource.notify();
      return Response.json({ ok: true });
    },
  },
  register: [pushAndExitJob, exitCleanFinalizeJob, exitCleanTool, flagRaiseTool],
} satisfies ServerPluginDefinition;
