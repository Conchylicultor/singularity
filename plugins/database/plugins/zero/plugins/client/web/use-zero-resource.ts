import { useQuery } from "@rocicorp/zero/react";
// Same defensive binding side-effect import as zero-root: ensure Zero's query
// bindings are registered even if a tree-shake would otherwise drop them.
import "@rocicorp/zero/bindings";
import type { Query, Schema, HumanReadable } from "@rocicorp/zero";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";

/**
 * `useResource`-shaped adapter over a Zero ZQL query. Takes a ZQL query and
 * returns the existing live-state `ResourceResult<T>` discriminated union, so a
 * Zero-backed read drops straight into `ResourceView` / `matchResource` /
 * `useCombinedResources` with no call-site churn.
 *
 * Zero's `useQuery` returns `[rows, result]`; `result.type === "unknown"` means
 * the query has not yet hydrated → `pending`. Otherwise the rows are live.
 * `refetch` is a no-op resolved promise: Zero is always-live, there is nothing
 * to re-fetch.
 */
export function useZeroResource<
  TTable extends keyof TSchema["tables"] & string,
  TSchema extends Schema,
  TReturn,
>(
  query: Query<TTable, TSchema, TReturn>,
): ResourceResult<HumanReadable<TReturn>> {
  const [rows, result] = useQuery(query);
  const refetch = () => Promise.resolve();
  return result.type === "unknown"
    ? { pending: true, error: null, refetch }
    : { pending: false, data: rows, error: null, refetch };
}

// Re-export Zero's raw `useQuery` for callers that want the `[rows, result]`
// tuple directly rather than the ResourceResult adapter.
export { useQuery as useZeroQuery } from "@rocicorp/zero/react";
