import { useCallback, useMemo } from "react";
import {
  skipToken,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { queryResult } from "./query-result";
import type { ResourceResult } from "./use-resource";

/**
 * A plain TanStack query read as a `ResourceResult` — for a read that is
 * neither a live resource (`useResource` / `useLive`) nor a GET endpoint
 * (`useEndpointResource`): typically a POST endpoint whose structured body is
 * the question, read with `fetchEndpoint` in the `queryFn`.
 *
 * React Query's own result hands `data: undefined` both while loading and
 * after a first-load failure, and its `isPending` / `isError` booleans let a
 * surface read `data ?? []` without asking which state it is in — the
 * pending-as-empty collapse. This turns it into the three arms every read
 * has, through the same mapping `useEndpointResource` uses:
 *
 * - `error` whenever the last fetch failed — the value it held before as
 *   `stale`, if any (a failed refetch keeps React Query's data);
 * - `loading` while no value has landed and nothing failed;
 * - `ready` otherwise (a `placeholderData` the caller opted into included).
 *
 * The failure is classified by `toResourceError`, as a live read's is
 * (an endpoint's HTTP 404 → `not-found`, another status → `loader-failed`, a
 * `fetch` that got no answer → `transport`, a response the schema rejects →
 * `client-outdated`).
 *
 * `enabled` is not an option: a disabled query is `loading` forever, the
 * spin-on-a-read-that-will-never-load bug. A query keyed by ANOTHER read's
 * value takes that read as `dep` and builds its options from the value — see
 * the second overload.
 */
export type QueryResourceOptions<
  TQueryFnData,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TQueryFnData, Error, TData, TQueryKey>, "enabled">;

/**
 * The paged twin's options: one page per fetch, `getNextPageParam` naming the
 * next. No `select` — the result's data is the page list itself.
 */
export type InfiniteQueryResourceOptions<
  TPage,
  TPageParam,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<
  UseInfiniteQueryOptions<
    TPage,
    Error,
    InfiniteData<TPage, TPageParam>,
    TQueryKey,
    TPageParam
  >,
  "enabled" | "select"
>;

/**
 * What a paged read adds to its ready arm — one vocabulary for every grow-able
 * read: `useInfiniteQueryResource`'s cursor pages and `useLive`'s window.
 */
export interface ResourcePaging {
  /** There is more to load — `loadMore()` would add some. */
  canGrow: boolean;
  /** A `loadMore()` is loading; what is shown is what was already held. */
  growing: boolean;
  /** Load the next page (or grow the window by one). */
  loadMore: () => void;
}

/**
 * A paged read: `ResourceResult<Item[]>` whose ready arm carries the paging
 * handles. A load-more that FAILS is the error arm, with what was already
 * held as `stale` — the items the user was looking at, never a spinner.
 */
export type PagedResourceResult<Item> =
  | Extract<ResourceResult<Item[]>, { status: "loading" }>
  | Extract<ResourceResult<Item[]>, { status: "error" }>
  | (Extract<ResourceResult<Item[]>, { status: "ready" }> & ResourcePaging);

/** The key a dependent query sits on while its dependency has no value. */
const BLOCKED_KEY = ["\0query-resource-blocked"];

/**
 * The dependency's value to build options from, or — when there is none — the
 * result to return instead: its loading arm, or its failure when it failed
 * before ever landing (there is nothing to key the query by, and saying
 * `loading` would spin forever). A dependency that failed AFTER landing keys
 * the query by its last value: the answer stays as current as that value.
 */
type DepKey<D> =
  | { has: true; value: D }
  | {
      has: false;
      result: Extract<ResourceResult<never>, { status: "loading" | "error" }>;
    };

function depKey<D>(dep: ResourceResult<D>): DepKey<D> {
  switch (dep.status) {
    case "ready":
      return { has: true, value: dep.data };
    case "loading":
      return { has: false, result: dep };
    case "error":
      return dep.stale !== undefined
        ? { has: true, value: dep.stale }
        : {
            has: false,
            result: { status: "error", error: dep.error, refetch: dep.refetch },
          };
  }
}

/** A TanStack query as a `ResourceResult`. */
export function useQueryResource<
  TQueryFnData,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: QueryResourceOptions<TQueryFnData, TData, TQueryKey>,
): ResourceResult<TData>;
/**
 * A query keyed by another read's value (a revision, an id): `options` is
 * built from `dep`'s value once it has one. Until then the result is `dep`'s
 * own loading arm, or its failure — never a disabled query pending forever.
 */
export function useQueryResource<
  D,
  TQueryFnData,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  dep: ResourceResult<D>,
  options: (value: D) => QueryResourceOptions<TQueryFnData, TData, TQueryKey>,
): ResourceResult<TData>;
export function useQueryResource<
  D,
  TQueryFnData,
  TData,
  TQueryKey extends QueryKey,
>(
  first:
    QueryResourceOptions<TQueryFnData, TData, TQueryKey> | ResourceResult<D>,
  build?: (value: D) => QueryResourceOptions<TQueryFnData, TData, TQueryKey>,
): ResourceResult<TData> {
  const dep = build === undefined ? null : (first as ResourceResult<D>);
  // Memoized on the dependency's (memoized) result, so the blocked arm keeps
  // one identity while the dependency does.
  const key = useMemo(() => (dep === null ? null : depKey(dep)), [dep]);
  const options =
    build === undefined
      ? (first as QueryResourceOptions<TQueryFnData, TData, TQueryKey>)
      : key!.has
        ? build(key!.value)
        : ({
            queryKey: BLOCKED_KEY,
            queryFn: skipToken,
          } as unknown as QueryResourceOptions<TQueryFnData, TData, TQueryKey>);
  const { data, error, refetch: refetchQuery } = useQuery(options);
  const blocked = key !== null && !key.has ? key.result : null;
  return useMemo(
    (): ResourceResult<TData> =>
      blocked ?? queryResult(data, error, refetchQuery),
    [blocked, data, error, refetchQuery],
  );
}

/** A paged TanStack query as a `PagedResourceResult` — data is the page list. */
export function useInfiniteQueryResource<
  TPage,
  TPageParam,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: InfiniteQueryResourceOptions<TPage, TPageParam, TQueryKey>,
): PagedResourceResult<TPage>;
/** The dependent form — see `useQueryResource`'s. */
export function useInfiniteQueryResource<
  D,
  TPage,
  TPageParam,
  TQueryKey extends QueryKey = QueryKey,
>(
  dep: ResourceResult<D>,
  options: (
    value: D,
  ) => InfiniteQueryResourceOptions<TPage, TPageParam, TQueryKey>,
): PagedResourceResult<TPage>;
export function useInfiniteQueryResource<
  D,
  TPage,
  TPageParam,
  TQueryKey extends QueryKey,
>(
  first:
    | InfiniteQueryResourceOptions<TPage, TPageParam, TQueryKey>
    | ResourceResult<D>,
  build?: (
    value: D,
  ) => InfiniteQueryResourceOptions<TPage, TPageParam, TQueryKey>,
): PagedResourceResult<TPage> {
  const dep = build === undefined ? null : (first as ResourceResult<D>);
  // Memoized on the dependency's (memoized) result, so the blocked arm keeps
  // one identity while the dependency does.
  const key = useMemo(() => (dep === null ? null : depKey(dep)), [dep]);
  const options =
    build === undefined
      ? (first as InfiniteQueryResourceOptions<TPage, TPageParam, TQueryKey>)
      : key!.has
        ? build(key!.value)
        : ({
            queryKey: BLOCKED_KEY,
            queryFn: skipToken,
            initialPageParam: null,
            getNextPageParam: () => undefined,
          } as unknown as InfiniteQueryResourceOptions<
            TPage,
            TPageParam,
            TQueryKey
          >);
  const q = useInfiniteQuery(options);
  const { data, error, refetch: refetchQuery, fetchNextPage } = q;
  const { hasNextPage, isFetchingNextPage } = q;
  const blocked = key !== null && !key.has ? key.result : null;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  return useMemo((): PagedResourceResult<TPage> => {
    if (blocked !== null) return blocked;
    const r = queryResult(data?.pages, error, refetchQuery);
    switch (r.status) {
      case "loading":
      case "error":
        return r;
      case "ready":
        return {
          ...r,
          canGrow: hasNextPage && !isFetchingNextPage,
          growing: isFetchingNextPage,
          loadMore,
        };
    }
  }, [
    blocked,
    data,
    error,
    refetchQuery,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
  ]);
}
