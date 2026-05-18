import { listConversationsForDisplay } from "@plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listConversations } from "../../core/endpoints";

export const handleList = implement(listConversations, async () => {
  return listConversationsForDisplay();
});
