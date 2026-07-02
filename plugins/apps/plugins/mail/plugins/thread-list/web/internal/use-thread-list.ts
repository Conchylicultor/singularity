import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { MailThread } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import {
  queryThreadsEndpoint,
  mailThreadsRevisionResource,
  type MailThreadPage,
} from "../../core";

const PAGE_SIZE = 50;

export interface ThreadListResult {
  items: MailThread[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

/**
 * The live, windowed thread list for a mailbox view. `useInfiniteQuery` owns the
 * keyset pages (fresh page 0 whenever `view` changes the query key); a
 * subscription to the coarse `mailThreadsRevisionResource` triggers an in-place
 * `refetch()` of the already-loaded pages on any real thread change — so the
 * list stays live with no polling and no scroll reset.
 */
export function useThreadList(view: string): ThreadListResult {
  const query = useInfiniteQuery({
    queryKey: ["mail-threads", view],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }): Promise<MailThreadPage> =>
      fetchEndpoint(
        queryThreadsEndpoint,
        {},
        { body: { view, cursor: pageParam, limit: PAGE_SIZE } },
      ),
    getNextPageParam: (last) => last.nextCursor,
  });

  // Refetch loaded pages when the coarse revision advances. The result is
  // narrowed inside the effect (never collapsing `pending` into a default in
  // render); the first observed value only seeds the ref (no refetch on mount —
  // page 0 is already loading), and each subsequent change triggers an in-place
  // refetch that preserves loaded pages + scroll.
  const revResult = useResource(mailThreadsRevisionResource);
  const seenRev = useRef<string | null>(null);
  const refetch = query.refetch;
  useEffect(() => {
    if (revResult.pending) return;
    const rev = revResult.data.rev;
    if (seenRev.current === null) {
      seenRev.current = rev;
      return;
    }
    if (rev !== seenRev.current) {
      seenRev.current = rev;
      void refetch();
    }
  }, [revResult, refetch]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return {
    items,
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}
