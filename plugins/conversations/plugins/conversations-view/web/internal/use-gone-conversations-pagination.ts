import {
  useCursorPagination,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { listGoneConversations } from "@plugins/conversations/core";

const PAGE_SIZE = 20;

export function useGoneConversationsPagination({
  recentGone,
  hasMoreGone,
  liveIds,
}: {
  recentGone: Conversation[];
  hasMoreGone: boolean;
  liveIds: Set<string>;
}) {
  const cursor =
    hasMoreGone && recentGone.length > 0
      ? (
          recentGone[recentGone.length - 1]!.endedAt ??
          recentGone[recentGone.length - 1]!.createdAt
        ).toISOString()
      : null;

  return useCursorPagination({
    queryKey: ["conversations-gone-paginated"],
    fetchPage: async (before, limit) => {
      return await fetchEndpoint(listGoneConversations, {}, { query: { before, limit: String(limit) } });
    },
    cursor,
    enabled: hasMoreGone,
    pageSize: PAGE_SIZE,
    getCursor: (c) => (c.endedAt ?? c.createdAt).toISOString(),
    liveIds,
    getId: (c) => c.id,
  });
}
