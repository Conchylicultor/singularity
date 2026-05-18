import { listGoneConversations as listGoneConversationsDb } from "@plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listGoneConversations } from "../../core/endpoints";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const handleListGone = implement(listGoneConversations, async ({ query }) => {
  const before = new Date(query.before);
  if (isNaN(before.getTime())) {
    throw new HttpError(400, "Invalid date: before");
  }

  const parsed = parseInt(query.limit ?? "", 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, isNaN(parsed) ? DEFAULT_LIMIT : parsed));

  const rows = await listGoneConversationsDb({ before, limit: limit + 1 });
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
  };
});
