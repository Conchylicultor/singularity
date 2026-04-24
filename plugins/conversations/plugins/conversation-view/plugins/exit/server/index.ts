import type { ServerPluginDefinition } from "@server/types";
import {
  deleteConversation,
  recentConversationsResource,
} from "@plugins/conversations/server";
import { getConversation } from "@plugins/tasks-core/server";

export default {
  id: "exit",
  name: "Exit",
  httpRoutes: {
    "POST /api/conversations/:id/exit": async (_req, { id }) => {
      if (!id) return new Response("Missing id", { status: 400 });

      const conversation = await getConversation(id);
      if (!conversation) {
        return new Response("Conversation not found", { status: 404 });
      }

      await deleteConversation(id);
      recentConversationsResource.notify();

      return Response.json({ ok: true });
    },
  },
} satisfies ServerPluginDefinition;
