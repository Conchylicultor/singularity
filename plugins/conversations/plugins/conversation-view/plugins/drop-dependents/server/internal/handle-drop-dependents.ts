import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation } from "@plugins/conversations/server";
import {
  getConversation,
  dropTaskTree,
  markConversationClosed,
  notifyConversationsChanged,
} from "@plugins/tasks-core/server";
import { dropDependents } from "../../shared/endpoints";

export const handleDropDependents = implement(dropDependents, async ({ params }) => {
  const { id } = params;

  const conversation = await getConversation(id);
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }

  const dropped = await dropTaskTree(conversation.taskId);

  await markConversationClosed(id);
  await deleteConversation(id);
  notifyConversationsChanged();

  return { ok: true, dropped };
});
