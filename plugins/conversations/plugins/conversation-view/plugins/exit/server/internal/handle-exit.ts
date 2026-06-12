import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation } from "@plugins/conversations/server";
import { getConversation, markConversationClosed, notifyConversationsChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { exitConversation } from "../../core/endpoints";

export const handleExit = implement(exitConversation, async ({ params }) => {
  const conversation = await getConversation(params.id);
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }

  await markConversationClosed(params.id);
  await deleteConversation(params.id);
  notifyConversationsChanged();
});
