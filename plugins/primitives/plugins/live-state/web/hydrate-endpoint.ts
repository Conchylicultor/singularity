import type { EndpointDef } from "@plugins/infra/plugins/endpoints/core";
import { endpointQueryKey } from "@plugins/infra/plugins/endpoints/web";
import { hydrateQuery } from "./use-resource";

// Seed a GET endpoint's query cache before mount — the endpoint companion to
// hydrateResource. Used by Core.Boot tasks that pre-fetch data the first render
// depends on, so the matching useEndpoint reads it synchronously instead of
// flashing its loading state (canonical use: tweakcn's preset list, which the
// theme injector needs on the first frame).
//
// Lives here, not in endpoints: live-state owns the app's default QueryClient
// and already sits downstream of endpoints (via log-channels), so the import
// can only point this way. endpoints still owns the key shape via
// endpointQueryKey — the same builder useEndpoint reads, so they cannot drift.
export function hydrateEndpoint<Route extends string, TParams, TResponse, TQuery>(
  endpoint: EndpointDef<Route, TParams, void, TResponse, TQuery>,
  params: TParams,
  opts: { query?: TQuery } | undefined,
  data: TResponse,
): void {
  hydrateQuery(endpointQueryKey(endpoint, params, opts?.query), data);
}
