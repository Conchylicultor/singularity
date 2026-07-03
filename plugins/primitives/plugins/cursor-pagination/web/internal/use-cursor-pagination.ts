import { useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { CursorPage } from "../../core";
import {
  useInfiniteScroll,
  type InfiniteScrollHandle,
} from "./use-infinite-scroll";

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

export interface CursorPaginationHandle<T> extends InfiniteScrollHandle {
  items: T[];
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
  // eslint-disable-next-line react-hooks/refs -- intentional frozen-cursor capture: read in render to seed a stable useInfiniteQuery; freezing across refetch is the design
  if (cursor !== null && frozenCursorRef.current === null) {
    frozenCursorRef.current = cursor;
  }

  const {
    data,
    fetchNextPage: tanstackFetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    // eslint-disable-next-line react-hooks/refs -- intentional frozen-cursor capture: read in render to seed a stable useInfiniteQuery; freezing across refetch is the design
    queryKey: [...queryKey, frozenCursorRef.current],
    queryFn: async ({ pageParam }) =>
      fetchPage(pageParam as string, pageSize),
    // eslint-disable-next-line react-hooks/refs -- intentional frozen-cursor capture: read in render to seed a stable useInfiniteQuery; freezing across refetch is the design
    initialPageParam: frozenCursorRef.current ?? "",
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      const tail = lastPage.items[lastPage.items.length - 1];
      return tail ? getCursor(tail) : undefined;
    },
    // eslint-disable-next-line react-hooks/refs -- intentional frozen-cursor capture: read in render to seed a stable useInfiniteQuery; freezing across refetch is the design
    enabled: enabled && frozenCursorRef.current !== null,
    staleTime: Infinity,
  });

  const items = useMemo(() => {
    const flat = (data?.pages ?? []).flatMap((p) => p.items);
    if (!liveIds || !getId) return flat;
    return flat.filter((item) => !liveIds.has(getId(item)));
  }, [data, liveIds, getId]);

  const scroll = useInfiniteScroll({
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasNextPage can be undefined before first fetch
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage: () => void tanstackFetchNextPage(),
  });

  return { items, ...scroll };
}
