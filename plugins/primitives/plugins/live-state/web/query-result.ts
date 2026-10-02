import { toResourceError } from "./resource-error";
import type { ResourceResult } from "./use-resource";

/**
 * THE mapping from a TanStack query's (data, error) to a `ResourceResult` —
 * shared by `useResource`, `useQueryResource`, `useInfiniteQueryResource` and
 * `useEndpointResource`. Pure; memoize at the call site.
 *
 * - `error` whenever the last fetch failed — the value it held before as
 *   `stale`, if any;
 * - `loading` while no value has landed and nothing failed;
 * - `ready` otherwise.
 *
 * `landed` says whether `data` is a real value. It defaults to
 * `data !== undefined`; a read whose query holds a placeholder before its
 * first load (`useResource`'s `initialData` at `dataUpdatedAt === 0`) passes
 * its own answer, so the placeholder is neither `ready` nor `stale`.
 */
export function queryResult<T>(
  data: T | undefined,
  error: unknown,
  refetchQuery: () => Promise<unknown>,
  landed: boolean = data !== undefined,
): ResourceResult<T> {
  const refetch = () => refetchQuery().then(() => {});
  const value = landed ? data : undefined;
  if (error !== null && error !== undefined)
    return value === undefined
      ? { status: "error", error: toResourceError(error), refetch }
      : {
          status: "error",
          error: toResourceError(error),
          stale: value,
          refetch,
        };
  if (!landed) return { status: "loading", refetch };
  return { status: "ready", data: data as T, refetch };
}
