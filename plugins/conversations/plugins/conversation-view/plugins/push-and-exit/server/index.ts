import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import type { ServerPluginDefinition } from "@server/types";
import { pushAndExitJob } from "./internal/push-and-exit-job";
import { pushAndExitResource } from "./internal/state";
import { _pushAndExitJobs } from "./internal/tables";
// Side-effect imports: register the finalize job and the exit_clean /
// flag_raise MCP tools at module load so they're in their respective
// registries before the first toolbar click or model tool call.
import "./internal/exit-clean-finalize-job";
import "./internal/mcp-tools";

export default {
  id: "push-and-exit",
  name: "Push and Exit",
  resources: [pushAndExitResource],
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
} satisfies ServerPluginDefinition;
