import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation } from "@plugins/conversations/server";
import {
  getConversation,
  listActiveConversations,
  listPushesForAttempt,
  markConversationClosed,
  notifyConversationsChanged,
  updateTask,
} from "@plugins/tasks-core/server";
import { dropAndExit } from "../../shared/endpoints";

export const handleDropAndExit = implement(dropAndExit, async ({ params }) => {
  const { id } = params;

  const conversation = await getConversation(id);
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
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
  notifyConversationsChanged();

  return { ok: true, dropped: !hasPush && !hasOtherActive };
});
