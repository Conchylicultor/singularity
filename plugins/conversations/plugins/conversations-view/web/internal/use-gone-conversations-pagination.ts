import { GonePageSchema } from "@plugins/conversations/web";
import {
  useCursorPagination,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import type { Conversation } from "@plugins/tasks-core/core";

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
      const params = new URLSearchParams({ before, limit: String(limit) });
      const res = await fetch(`/api/conversations/gone?${params}`);
      if (!res.ok) throw new Error("Failed to fetch gone conversations");
      return GonePageSchema.parse(await res.json());
    },
    cursor,
    enabled: hasMoreGone,
    pageSize: PAGE_SIZE,
    getCursor: (c) => (c.endedAt ?? c.createdAt).toISOString(),
    liveIds,
    getId: (c) => c.id,
  });
}
