import { useMemo } from "react";
import type { EndpointDef } from "@plugins/infra/plugins/endpoints/core";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { toResourceError } from "./resource-error";
import type { ResourceResult } from "./use-resource";

/**
 * A GET endpoint read as a `ResourceResult` — the endpoint companion to
 * `useResource`, as `hydrateEndpoint` is to `hydrateResource`. `useEndpoint`
 * hands back React Query's own result, whose `data` is `undefined` both while
 * loading and after a first-load failure; a domain hook re-shaping that by hand
 * either collapses the two (a failed catalog renders as forever-loading) or has
 * to hand-write result arms. This is the one place that mapping is written:
 *
 * - `error` whenever the last fetch failed — with the value it held before as
 *   `stale`, if any (a failed refetch keeps React Query's data);
 * - `loading` while no value has landed and nothing failed;
 * - `ready` otherwise.
 *
 * The error is classified through the same `toResourceError` a live read's is,
 * so a surface renders both failures alike. The result is memoized on the
 * query's data / error identity, like `useResource`'s.
 *
 * Lives here, not in endpoints, for the same reason `hydrateEndpoint` does:
 * live-state owns `ResourceResult` and already sits downstream of endpoints.
 */
export function useEndpointResource<
  Route extends string,
  TParams,
  TResponse,
  TQuery,
>(
  endpoint: EndpointDef<Route, TParams, void, TResponse, TQuery>,
  params: TParams,
  opts?: { query?: TQuery },
): ResourceResult<TResponse> {
  const q = useEndpoint(endpoint, params, opts);
  const { data, error, refetch: refetchQuery } = q;
  return useMemo((): ResourceResult<TResponse> => {
    const refetch = () => refetchQuery().then(() => {});
    if (error !== null)
      return data === undefined
        ? {
            status: "error",
            error: toResourceError(error),
            refetch,
          }
        : {
            status: "error",
            error: toResourceError(error),
            stale: data,
            refetch,
          };
    if (data === undefined) return { status: "loading", refetch };
    return { status: "ready", data, refetch };
  }, [data, error, refetchQuery]);
}
