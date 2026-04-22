import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import {
  recentConversationsResource,
  resumeConversation,
} from "@plugins/conversations/server";

export default {
  id: "resume",
  name: "Resume",
  httpRoutes: {
    "POST /api/conversations/:id/resume": async (_req, { id }) => {
      if (!id) return new Response("Missing id", { status: 400 });
      try {
        await resumeConversation(id);
        recentConversationsResource.notify();
        return Response.json({ ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(msg, { status: 409 });
      }
    },
  },
} satisfies ServerPluginDefinition;
