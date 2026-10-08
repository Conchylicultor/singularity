import { conversationIdKind } from "@plugins/tasks/plugins/task-ids/core";
import { deleteConversationRow } from "@plugins/tasks/plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteConversation as deleteConversationEndpoint } from "../../core/endpoints";
import { deleteConversation } from "./lifecycle";

export const handleDelete = implement(
  deleteConversationEndpoint,
  async ({ query }) => {
    if (!conversationIdKind.is(query.name)) {
      throw new HttpError(400, "Invalid session name");
    }
    await deleteConversation(query.name);
    await deleteConversationRow(query.name);
  },
);
