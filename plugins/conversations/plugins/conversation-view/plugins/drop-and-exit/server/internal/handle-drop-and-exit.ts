import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation } from "@plugins/conversations/server";
import {
  getConversation,
  markConversationClosed,
} from "@plugins/tasks/plugins/tasks-core/server";
import { dropAndExit } from "../../core/endpoints";
import { dropTaskOnExit } from "./drop-task-on-exit";

export const handleDropAndExit = implement(dropAndExit, async ({ params }) => {
  const { id } = params;

  const conversation = await getConversation(id);
  if (!conversation) {
    throw new HttpError(404, "Conversation not found");
  }

  // The user chose Drop from the exit menu: anything not yet in `main` drops.
  const dropped = await dropTaskOnExit(conversation, "unless-landed");

  await markConversationClosed(id);
  await deleteConversation(id);

  return { ok: true, dropped };
});
