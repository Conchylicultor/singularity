import { markConversationClosed, notifyConversationsChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { closeConversation } from "../../core/endpoints";
import { deleteConversation } from "./lifecycle";

export const handleClose = implement(closeConversation, async ({ params }) => {
  await markConversationClosed(params.id);
  await deleteConversation(params.id);
  notifyConversationsChanged();
});
