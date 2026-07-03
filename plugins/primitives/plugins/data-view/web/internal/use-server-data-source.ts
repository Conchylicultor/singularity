import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useInfiniteScroll,
  type InfiniteScrollHandle,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import type {
  DataViewId,
  FilterGroup,
  ServerDataSourceSpec,
  SortRule,
} from "../../core";

const DEFAULT_PAGE_SIZE = 40;

/** The view state that drives a server query — the user-authored sort/filter/query. */
interface ServerQueryView {
  sort: SortRule[];
  filter: FilterGroup | null;
  query: string;
}

export interface ServerDataSourceResult<TRow> {
  rows: readonly TRow[];
  loading: boolean;
  scroll: InfiniteScrollHandle;
}

/**
 * Deterministic JSON of the view state — sorts object keys so that two
 * structurally-equal view states always stringify identically (drives the
 * `queryKey`, restarting pagination from page 0 whenever sort/filter/query
 * change). `FilterGroup`/`SortRule` are plain JSON trees, so a key-sorted
 * `JSON.stringify` is total and stable.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, obj[k]]),
      );
    }
    return val;
  });
}

/**
 * Generic server-delegated data source for `<DataView>`. Returns `null` when
 * `spec` is undefined (the in-memory path) — but is ALWAYS called
 * unconditionally: the gating happens internally via `useInfiniteQuery`'s
 * `enabled`, so React's rules-of-hooks / the React Compiler stay satisfied.
 *
 * - `queryKey` carries `stableStringify(view)` → changing sort/filter/query
 *   yields a fresh key → pagination restarts from page 0.
 * - `changeTick` is kept OUT of the queryKey; instead, when it changes, the hook
 *   `refetch()`es ALL currently-loaded pages in place (each re-runs with its
 *   stored keyset `pageParam`, so the window stays gap-free under live inserts).
 * - The returned `scroll` handle (from `useInfiniteScroll`) owns the
 *   error-gated `IntersectionObserver` sentinel that fetches the next page on view.
 */
export function useServerDataSource<TRow>(
  view: ServerQueryView,
  spec: ServerDataSourceSpec<TRow> | undefined,
  storageKey: DataViewId,
): ServerDataSourceResult<TRow> | null {
  const viewKey = stableStringify({
    sort: view.sort,
    filter: view.filter,
    query: view.query,
  });

  const pageSize = spec?.pageSize ?? DEFAULT_PAGE_SIZE;

  const query = useInfiniteQuery({
    queryKey: ["data-view-server", viewKey],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      // `enabled: !!spec` guarantees `spec` is present whenever this runs.
      if (!spec) throw new Error("useServerDataSource: queryFn with no spec");
      return spec.fetchPage({
        sort: view.sort,
        filter: view.filter,
        query: view.query,
        cursor: pageParam,
        limit: pageSize,
        dataViewId: storageKey,
      });
    },
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: !!spec,
    staleTime: Infinity,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    refetch,
  } = query;

  // `changeTick` drives an in-place refetch of the loaded window (NOT a key
  // change) — compare to a ref so the very first render doesn't refetch.
  const lastTickRef = useRef<unknown>(spec?.changeTick);
  useEffect(() => {
    if (!spec) return;
    if (lastTickRef.current === spec.changeTick) return;
    lastTickRef.current = spec.changeTick;
    void refetch();
  }, [spec, spec?.changeTick, refetch]);

  const rows = useMemo<readonly TRow[]>(
    () => (data?.pages ?? []).flatMap((p) => p.items),
    [data],
  );

  // Build the scroll handle unconditionally (before the `!spec` early-return) so
  // the hook order stays stable whether or not a server spec is present.
  const scroll = useInfiniteScroll({
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasNextPage can be undefined before first fetch
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage: () => void fetchNextPage(),
  });

  if (!spec) return null;

  return {
    rows,
    loading: isFetching && rows.length === 0,
    scroll,
  };
}
