import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useInfiniteScroll,
  type InfiniteScrollHandle,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import type { DataViewId, ServerDataSourceSpec, SortRule } from "../../core";
import type { ServerFilterResult } from "./server-filter";

const DEFAULT_PAGE_SIZE = 40;

/**
 * What drives a server query: the view's sort, and its filter ALREADY lowered
 * (search folded in) by `useServerFilter` — or the reason it cannot be sent.
 */
interface ServerQueryView {
  sort: SortRule[];
  filter: ServerFilterResult;
}

export interface ServerDataSourceResult<TRow> {
  rows: readonly TRow[];
  loading: boolean;
  /**
   * Why the surface has no rows to show: the filter cannot be sent (over the
   * filter language's bounds), or the FIRST page failed (the server refused or
   * errored). A later page's failure is the footer's Retry instead, over rows
   * already shown. `null` otherwise — never an empty list standing in for it.
   */
  error: Error | null;
  scroll: InfiniteScrollHandle;
}

/**
 * Deterministic JSON of the view state — sorts object keys so that two
 * structurally-equal view states always stringify identically (drives the
 * `queryKey`, restarting pagination from page 0 whenever sort/filter change).
 * The filter is canonical and `SortRule` a plain JSON tree, so a key-sorted
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
 * - `queryKey` carries the surface identity (`storageKey` + `sourceScope`) plus
 *   `stableStringify(view)`. The identity segments keep two surfaces (or two
 *   sources of one surface) with structurally-equal view state from sharing
 *   pages fetched by a *different* `fetchPage` (the cache is `staleTime:
 *   Infinity`). Deliberately NO per-instance `viewId`: instances of one surface
 *   share one `fetchPage`, so cross-instance sharing is correct. Changing
 *   sort/filter (search included) yields a fresh key → pagination restarts
 *   from page 0.
 * - A filter that cannot be sent (`view.filter.kind === "error"`) disables the
 *   query and is reported as `error` — no request, no empty page.
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
  /** Per-source cache scope on a multi-source surface; `""` = the sole source. */
  sourceScope = "",
  opts: {
    /**
     * While this returns true for the loaded rows, the next page is NOT
     * auto-fetched: the handle reports `hasNextPage: false`, so the footer
     * renders no sentinel. It feeds the scroll observer's own gate (and so its
     * rebuild deps) rather than hiding the sentinel from outside — a sentinel
     * unmounted and remounted behind the observer's back is never re-observed,
     * and pagination would stall with no error. The DataView host uses it to
     * stop paging while the loaded tail is folded (see `isTailFolded`).
     */
    holdPaging?: (rows: readonly TRow[]) => boolean;
  } = {},
): ServerDataSourceResult<TRow> | null {
  const filter = view.filter.kind === "ok" ? view.filter.filter : undefined;
  const viewKey = stableStringify({ sort: view.sort, filter: filter ?? null });
  const sendable = !!spec && view.filter.kind === "ok";

  const pageSize = spec?.pageSize ?? DEFAULT_PAGE_SIZE;

  const query = useInfiniteQuery({
    queryKey: ["data-view-server", storageKey, sourceScope, viewKey],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      // `enabled: !!spec` guarantees `spec` is present whenever this runs.
      if (!spec) throw new Error("useServerDataSource: queryFn with no spec");
      return spec.fetchPage({
        sort: view.sort,
        filter,
        cursor: pageParam,
        limit: pageSize,
        dataViewId: storageKey,
      });
    },
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: sendable,
    staleTime: Infinity,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    isError,
    error: queryError,
    refetch,
  } = query;

  // `changeTick` drives an in-place refetch of the loaded window (NOT a key
  // change) — compare to a ref so the very first render doesn't refetch.
  const lastTickRef = useRef<unknown>(spec?.changeTick);
  useEffect(() => {
    if (!spec || !sendable) return;
    if (lastTickRef.current === spec.changeTick) return;
    lastTickRef.current = spec.changeTick;
    void refetch();
  }, [spec, spec?.changeTick, sendable, refetch]);

  const rows = useMemo<readonly TRow[]>(
    () => (data?.pages ?? []).flatMap((p) => p.items),
    [data],
  );

  // Build the scroll handle unconditionally (before the `!spec` early-return) so
  // the hook order stays stable whether or not a server spec is present.
  const held = opts.holdPaging?.(rows) ?? false;
  const scroll = useInfiniteScroll({
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- hasNextPage can be undefined before first fetch
    hasNextPage: (hasNextPage ?? false) && !held,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage: () => void fetchNextPage(),
  });

  if (!spec) return null;

  const error =
    view.filter.kind === "error"
      ? view.filter.error
      : isError && rows.length === 0
        ? queryError
        : null;

  return {
    rows,
    loading: sendable && isFetching && rows.length === 0,
    error,
    scroll,
  };
}
