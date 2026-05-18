import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { EndpointDef } from "../../core/define-endpoint";
import { fetchEndpoint } from "./fetch-endpoint";

/**
 * TanStack Query wrapper for GET endpoints.
 *
 * Query key: ["endpoint", route, serializedParams, serializedQuery]
 */
export function useEndpoint<
  Route extends string,
  TParams,
  TResponse,
  TQuery,
>(
  endpoint: EndpointDef<Route, TParams, void, TResponse, TQuery>,
  params: TParams,
  opts?: { query?: TQuery; enabled?: boolean },
): UseQueryResult<TResponse> {
  const query = opts?.query;
  const enabled = opts?.enabled;

  return useQuery({
    queryKey: [
      "endpoint",
      endpoint.route,
      JSON.stringify(params ?? {}),
      JSON.stringify(query ?? {}),
    ],
    queryFn: async ({ signal }) => {
      const fetchOpts = query != null
        ? { query, signal } as { query: TQuery; signal: AbortSignal }
        : { signal } as { signal: AbortSignal };
      const result = await fetchEndpoint(
        endpoint,
        params,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal dispatch; external callers are fully typed
        fetchOpts as any,
      );
      return result as TResponse;
    },
    enabled,
  });
}
