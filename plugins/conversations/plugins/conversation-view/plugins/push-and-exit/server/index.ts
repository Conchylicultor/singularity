import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import { jobs, pushAndExitResource, runJob } from "./internal/job-runner";

export default {
  id: "push-and-exit",
  name: "Push and Exit",
  resources: [pushAndExitResource],
  httpRoutes: {
    "POST /api/conversations/:id/push-and-exit": async (_req, { id }) => {
      if (jobs.get(id)?.status === "running") {
        return Response.json({ error: "Already running" }, { status: 409 });
      }
      jobs.set(id, { status: "running" });
      pushAndExitResource.notify();
      void runJob(id).catch((err) => {
        console.error("[push-and-exit] runJob threw unexpectedly", err);
      });
      return Response.json({ ok: true }, { status: 202 });
    },
    "DELETE /api/conversations/:id/push-and-exit": (_req, { id }) => {
      jobs.delete(id);
      pushAndExitResource.notify();
      return Response.json({ ok: true });
    },
  },
} satisfies ServerPluginDefinition;
