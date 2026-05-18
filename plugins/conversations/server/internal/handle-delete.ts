import { deleteConversationRow } from "@plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation as deleteConversationEndpoint } from "../../core/endpoints";
import { deleteConversation } from "./lifecycle";

export const handleDelete = implement(deleteConversationEndpoint, async ({ query }) => {
  if (!/^(conv|claude)-\d+(-[a-z0-9]+)?$/.test(query.name)) {
    throw new HttpError(400, "Invalid session name");
  }
  await deleteConversation(query.name);
  await deleteConversationRow(query.name);
  return { ok: true };
});
