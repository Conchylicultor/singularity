import type { ServerPluginDefinition } from "../../../../../../../server/src/types";
import {
  deleteConversation,
  conversationsResource,
} from "@plugins/conversations/server";
import { getConversation, updateTask } from "@plugins/tasks-core/server";

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

      await updateTask(conversation.taskId, { drop: true });

      await deleteConversation(id);
      conversationsResource.notify();

      return Response.json({ ok: true });
    },
  },
} satisfies ServerPluginDefinition;
