import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation } from "@plugins/conversations/server";
import {
  getConversation,
  markConversationClosed,
  maybeDropTaskOnExit,
  notifyConversationsChanged,
} from "@plugins/tasks/plugins/tasks-core/server";
import { dropAndExit } from "../../core/endpoints";

export const handleDropAndExit = implement(dropAndExit, async ({ params }) => {
  const { id } = params;

  const conversation = await getConversation(id);
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }

  const dropped = await maybeDropTaskOnExit(conversation);

  await markConversationClosed(id);
  await deleteConversation(id);
  notifyConversationsChanged();

  return { ok: true, dropped };
});
