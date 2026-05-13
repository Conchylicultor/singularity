import type { ServerPluginDefinition } from "@server/types";
import { deleteConversation } from "@plugins/conversations/server";
import { getConversation, markConversationClosed, notifyConversationsChanged } from "@plugins/tasks-core/server";

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

      await markConversationClosed(id);
      await deleteConversation(id);
      notifyConversationsChanged();

      return Response.json({ ok: true });
    },
  },
} satisfies ServerPluginDefinition;
