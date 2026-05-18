import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { EndpointDef } from "../../core/define-endpoint";
import { EndpointError, fetchEndpoint } from "./fetch-endpoint";

// Global mutation meta type — available on any useMutation/useEndpointMutation call.
// suppressError: true  → silence the global auto-toast (handle locally instead).
// When onError is provided, suppressError defaults to true automatically.
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      suppressError?: boolean;
    };
  }
}

type MutationVariables<TParams, TBody> = TParams extends Record<string, never>
  ? TBody extends void
    ? { params?: TParams; body?: never }
    : { params?: TParams; body: TBody }
  : TBody extends void
    ? { params: TParams; body?: never }
    : { params: TParams; body: TBody };

/**
 * TanStack Query useMutation wrapper for POST/PATCH/DELETE endpoints.
 *
 * On success, invalidates queries matching the listed endpoints' query key prefixes.
 * On error, the global auto-toast fires unless onError is provided or meta.suppressError is set.
 */
export function useEndpointMutation<
  Route extends string,
  TParams,
  TBody,
  TResponse,
  TQuery,
>(
  endpoint: EndpointDef<Route, TParams, TBody, TResponse, TQuery>,
  opts?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- invalidation targets are heterogeneous
    invalidates?: EndpointDef<any, any, any, any, any>[];
    onSuccess?: (data: TResponse extends void ? void : TResponse) => void;
    onError?: (err: EndpointError) => void;
    // Explicit override for the global toast. Defaults to true when onError is provided.
    meta?: { suppressError?: boolean };
  },
): UseMutationResult<
  TResponse extends void ? void : TResponse,
  EndpointError,
  MutationVariables<TParams, TBody>
> {
  const queryClient = useQueryClient();
  const suppressError = opts?.meta?.suppressError ?? (opts?.onError !== undefined);

  return useMutation<
    TResponse extends void ? void : TResponse,
    EndpointError,
    MutationVariables<TParams, TBody>
  >({
    meta: { suppressError },
    mutationFn: async (variables) => {
      const params = (variables.params ?? {}) as TParams;
      const body = "body" in variables ? variables.body : undefined;
      const fetchOpts = body !== undefined ? { body } : {};
      return fetchEndpoint(
        endpoint,
        params,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal dispatch; external callers are fully typed
        fetchOpts as any,
      ) as Promise<TResponse extends void ? void : TResponse>;
    },
    onSuccess: (data) => {
      if (opts?.invalidates) {
        for (const dep of opts.invalidates) {
          void queryClient.invalidateQueries({
            queryKey: ["endpoint", dep.route],
          });
        }
      }
      opts?.onSuccess?.(data);
    },
    onError: opts?.onError,
  });
}
