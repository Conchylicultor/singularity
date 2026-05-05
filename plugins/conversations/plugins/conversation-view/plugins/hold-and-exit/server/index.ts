import type { ServerPluginDefinition } from "@server/types";
import { deleteConversation } from "@plugins/conversations/server";
import { getConversation, recentConversationsResource, updateTask } from "@plugins/tasks-core/server";

export default {
  id: "hold-and-exit",
  name: "Hold and Exit",
  httpRoutes: {
    "POST /api/conversations/:id/hold-and-exit": async (_req, { id }) => {
      if (!id) return new Response("Missing id", { status: 400 });

      const conversation = await getConversation(id);
      if (!conversation) {
        return new Response("Conversation not found", { status: 404 });
      }

      await updateTask(conversation.taskId, { hold: true });

      await deleteConversation(id);
      recentConversationsResource.notify();

      return Response.json({ ok: true });
    },
  },
} satisfies ServerPluginDefinition;
