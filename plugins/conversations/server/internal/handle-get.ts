import { getConversation as getConversationDb } from "@plugins/tasks/plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getConversation } from "../../core/endpoints";

export const handleGet = implement(getConversation, async ({ params }) => {
  const row = await getConversationDb(params.id);
  if (!row) throw new HttpError(404, "Not found");
  return row;
});
