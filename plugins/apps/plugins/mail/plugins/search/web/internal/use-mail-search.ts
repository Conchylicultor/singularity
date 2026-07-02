import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { mailSearchEndpoint } from "@plugins/apps/plugins/mail/plugins/sync/core";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

/** A clean, flat handle over the paginated `GET /api/mail/search` result set. */
export interface MailSearchHandle {
  results: MailMessage[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  fetchNextPage: () => void;
}

/**
 * Accumulating on-demand mail search. Gmail returns an OPAQUE `nextPageToken`
 * (undefined on the last page), so this is NOT a keyset cursor — it can't use
 * the `useCursorPagination` primitive (`getCursor(item)`). Instead it mirrors
 * the `data-view` `useServerDataSource` shape: a `useInfiniteQuery` keyed by the
 * query, flattening `data.pages`, with an `IntersectionObserver` sentinel that
 * auto-fetches the next page as it scrolls into view.
 *
 * The observer is gated on `!isFetchNextPageError` so a failed next-page fetch
 * does not hot-loop the sentinel (the manual Retry button is the recovery path).
 *
 * @param q Already-trimmed, debounced query. Empty string disables the query.
 */
export function useMailSearch(q: string): MailSearchHandle {
  const enabled = q.length > 0;

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: ["mail-search", q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchEndpoint(
        mailSearchEndpoint,
        {},
        { query: pageParam ? { q, pageToken: pageParam } : { q } },
      ),
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled,
    staleTime: Infinity,
  });

  const results = useMemo(
    () => data?.pages.flatMap((p) => p.results) ?? [],
    [data],
  );

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (
        entry?.isIntersecting &&
        hasNextPage &&
        !isFetchingNextPage &&
        !isFetchNextPageError
      ) {
        void fetchNextPage();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  return {
    results,
    isLoading,
    isError,
    error,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasNextPage can be undefined before first fetch
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    isFetchNextPageError,
    sentinelRef,
    fetchNextPage: () => void fetchNextPage(),
  };
}
