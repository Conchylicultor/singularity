import type { ServerPluginDefinition } from "@server/types";
import { deleteConversation } from "@plugins/conversations/server";
import {
  getConversation,
  listActiveConversations,
  listPushesForAttempt,
  markConversationClosed,
  recentConversationsResource,
  updateTask,
} from "@plugins/tasks-core/server";

export default {
  id: "drop-and-exit",
  name: "Drop and Exit",
  httpRoutes: {
    "POST /api/conversations/:id/drop-and-exit": async (_req, { id }) => {
      if (!id) return new Response("Missing id", { status: 400 });

      const conversation = await getConversation(id);
      if (!conversation) {
        return new Response("Conversation not found", { status: 404 });
      }

      const pushes = conversation.attemptId
        ? await listPushesForAttempt(conversation.attemptId)
        : [];
      const hasPush = pushes.length > 0;

      const activeConversations = await listActiveConversations();
      const hasOtherActive = activeConversations.some(
        (c) => c.taskId === conversation.taskId && c.id !== id,
      );

      if (!hasPush && !hasOtherActive) {
        await updateTask(conversation.taskId, { drop: true });
      }

      await markConversationClosed(id);
      await deleteConversation(id);
      recentConversationsResource.notify();

      return Response.json({ ok: true, dropped: !hasPush && !hasOtherActive });
    },
  },
} satisfies ServerPluginDefinition;
