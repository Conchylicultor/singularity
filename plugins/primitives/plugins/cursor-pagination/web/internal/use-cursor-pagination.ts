import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { CursorPage } from "../../core";

const DEFAULT_PAGE_SIZE = 20;

export interface UseCursorPaginationOptions<T> {
  queryKey: string[];
  fetchPage: (cursor: string, pageSize: number) => Promise<CursorPage<T>>;
  cursor: string | null;
  getCursor: (item: T) => string;
  enabled?: boolean;
  pageSize?: number;
  liveIds?: Set<string>;
  getId?: (item: T) => string;
}

export interface CursorPaginationHandle<T> {
  items: T[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  fetchNextPage: () => void;
}

export function useCursorPagination<T>(
  opts: UseCursorPaginationOptions<T>,
): CursorPaginationHandle<T> {
  const {
    queryKey,
    fetchPage,
    cursor,
    getCursor,
    enabled = true,
    pageSize = DEFAULT_PAGE_SIZE,
    liveIds,
    getId,
  } = opts;

  const frozenCursorRef = useRef<string | null>(null);
  if (cursor !== null && frozenCursorRef.current === null) {
    frozenCursorRef.current = cursor;
  }

  const {
    data,
    fetchNextPage: tanstackFetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...queryKey, frozenCursorRef.current],
    queryFn: async ({ pageParam }) =>
      fetchPage(pageParam as string, pageSize),
    initialPageParam: frozenCursorRef.current ?? "",
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      const tail = lastPage.items[lastPage.items.length - 1];
      return tail ? getCursor(tail) : undefined;
    },
    enabled: enabled && frozenCursorRef.current !== null,
    staleTime: Infinity,
  });

  const items = useMemo(() => {
    const flat = (data?.pages ?? []).flatMap((p) => p.items);
    if (!liveIds || !getId) return flat;
    return flat.filter((item) => !liveIds.has(getId(item)));
  }, [data, liveIds, getId]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void tanstackFetchNextPage();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, tanstackFetchNextPage]);

  return {
    items,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasNextPage can be undefined before first fetch
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    sentinelRef,
    fetchNextPage: () => void tanstackFetchNextPage(),
  };
}
