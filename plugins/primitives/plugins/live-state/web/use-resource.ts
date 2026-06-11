import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type NonUndefinedGuard,
} from "@tanstack/react-query";
import { NotificationsClient, queryKeyFor } from "./notifications-client";
import type { ChannelStatuses } from "./notifications-client";
import type { ResourceDescriptor } from "../core/resource";
import type { WsStatus } from "@plugins/primitives/plugins/networking/web";

type ResourceParams = Record<string, string>;

const NotificationsContext = createContext<NotificationsClient | null>(null);

let defaultClient: QueryClient | null = null;
function getDefaultQueryClient(): QueryClient {
  if (!defaultClient) {
    defaultClient = new QueryClient({
      defaultOptions: {
        queries: {
          // The WS is the source of truth. Disable background refetches; the
          // notifications client keeps cached data in sync.
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          retry: 1,
        },
      },
    });
  }
  return defaultClient;
}

export interface NotificationsProviderProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function NotificationsProvider({ children, queryClient }: NotificationsProviderProps) {
  const qc = queryClient ?? getDefaultQueryClient();
  // NotificationsClient is a singleton for the tab; create on first render.
  const notifications = getOrCreateNotifications(qc);
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(NotificationsContext.Provider, { value: notifications }, children),
  );
}

let singleton: NotificationsClient | null = null;
function getOrCreateNotifications(qc: QueryClient): NotificationsClient {
  if (!singleton) singleton = new NotificationsClient(qc);
  return singleton;
}

// Context-free accessor for the singleton — usable from Core.Root watchers that
// may mount outside NotificationsProvider (the wedge watchdog). Returns null
// until the provider has created the client (i.e. before first render).
export function getNotificationsClient(): NotificationsClient | null {
  return singleton;
}

export function useNotificationsStatus(): WsStatus {
  const client = useContext(NotificationsContext);
  if (!client) throw new Error("useNotificationsStatus must be inside NotificationsProvider");
  const [status, setStatus] = useState(() => client.getStatus());
  useEffect(() => client.subscribeStatus(setStatus), [client]);
  return status;
}

export function useNotificationsChannelStatuses(): ChannelStatuses {
  const client = useContext(NotificationsContext);
  if (!client) throw new Error("useNotificationsChannelStatuses must be inside NotificationsProvider");
  const [statuses, setStatuses] = useState(() => client.getChannelStatuses());
  useEffect(() => client.subscribeChannelStatuses(setStatuses), [client]);
  return statuses;
}

// Accessor for the singleton NotificationsClient — consumers (the live-state
// health pane, the wedge watchdog) use it to reach probeMissedUpdates()/
// debugSnapshot()/subscribeDebug(). Must be called inside NotificationsProvider.
export function useNotificationsClient(): NotificationsClient {
  const client = useContext(NotificationsContext);
  if (!client) throw new Error("useNotificationsClient must be inside NotificationsProvider");
  return client;
}

// Seed the default query client's cache for a resource before any component
// observes it. Used at boot to hydrate values (e.g. config) so the first render
// reads real data synchronously instead of `pending`/defaults — no flash, no
// Suspense. Writes the SAME default client NotificationsProvider uses (no
// `queryClient` prop) via the SAME queryKeyFor consumers use, so a later
// useResource adopts the seeded entry (its non-zero dataUpdatedAt makes
// `pending` false immediately). The schema registry (NotificationsClient) is
// untouched — only applyUpdate reads it, and that fires only after a mounted
// useResource calls observe(), which registers the schema first.
export function hydrateResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params: P | undefined,
  value: unknown,
): void {
  const parsed = resource.schema.parse(value);
  getDefaultQueryClient().setQueryData(queryKeyFor(resource.key, params), parsed);
}

export type ResourceResult<T> =
  | { pending: true; error: Error | null; refetch: () => Promise<void> }
  | { pending: false; data: T; error: Error | null; refetch: () => Promise<void> };

// Shared HTTP fetch for a resource. Used by useResource's queryFn as the WS-down
// fallback; the sub-ack normally fills the cache so this rarely runs.
async function fetchResourceValue<T, P extends ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  p: ResourceParams,
): Promise<T> {
  const qs = new URLSearchParams(p).toString();
  const base = resource.origin === "central" ? "/api/central-resources" : "/api/resources";
  const url = `${base}/${encodeURIComponent(resource.key)}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Resource ${resource.key} fetch failed: ${res.status}`);
  const body = (await res.json()) as { value: unknown; version: number };
  return resource.schema.parse(body.value) as T;
}

// Optional read options for useResource.
export interface UseResourceOptions<T, S> {
  /**
   * Derive a slice of the resource payload. The component then re-renders
   * **only when the selected slice changes** (React Query runs `replaceEqualDeep`
   * on the select output, so a deeply-equal slice keeps its previous reference
   * and the observer is not notified). This is how a point/derived read of a
   * large list resource — e.g. one row out of `conversations` — avoids the
   * O(C²) re-render storm where every subscriber re-renders on every push.
   *
   * When `select` is set, notifications are scoped to data/error changes
   * (`notifyOnChangeProps`), so the per-push `dataUpdatedAt` bump no longer
   * forces a re-render. Consequence: `pending` flips to `false` silently (no
   * re-render) if the selected slice is identical across the
   * initialData→first-real-data boundary — harmless for point lookups, where
   * the caller sees the same value either way.
   *
   * Pass a **stable** selector (`useCallback`) so it is not re-run every render.
   */
  select: (data: T) => S;
  /**
   * Make the `pending` → settled flip reliable for READINESS GATES built on a
   * `select` read. Without it, the flip is silent (no re-render) when the
   * selected slice is identical across the initialData→first-real-data
   * boundary — harmless for point lookups, fatal for a gate (it can wedge as
   * pending forever). With `gate: true`, the subscription stays un-scoped
   * (full notifications) until the first authoritative value arrives — at most
   * a couple of pushes — then narrows to the select-scoped subscription, so
   * the steady-state re-render behavior is identical to plain `select`.
   */
  gate?: boolean;
}

// AGENT RULE: Never cast the `data` returned by useResource (e.g. `data as Foo[]`).
// `data` is only accessible after narrowing `result.pending === false`.
// The generic T is inferred from the ResourceDescriptor — casting silently hides type
// mismatches between the resource payload and your assumption.
export function useResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P,
): ResourceResult<T>;
export function useResource<T, S, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params: P | undefined,
  options: UseResourceOptions<T, S>,
): ResourceResult<S>;
export function useResource<T, S, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P,
  options?: UseResourceOptions<T, S>,
): ResourceResult<T | S> {
  const notifications = useContext(NotificationsContext);
  if (!notifications) {
    throw new Error("useResource must be used within a NotificationsProvider");
  }
  const key = resource.key;
  const origin = resource.origin;
  const p = (params ?? ({} as P)) as ResourceParams;

  const schema = resource.schema;
  const select = options?.select;
  const gate = options?.gate === true;

  // Refcount sub/unsub on mount/unmount.
  useEffect(() => {
    notifications.observe(key, p, origin, schema, resource.keyed?.keyOf);
    return () => notifications.unobserve(key, p, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stringify params for stable dep; callers pass small flat objects
  }, [notifications, key, origin, schema, JSON.stringify(p)]);

  // `gate`: keep the subscription un-scoped until this (key, params) has
  // settled once, so the pending→settled flip is guaranteed to re-render (a
  // select-scoped sub flips silently when the slice is identical across the
  // boundary). Keyed by query key so a param change re-gates.
  const keyStr = JSON.stringify(queryKeyFor(key, p));
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const selectActive = select !== undefined && (!gate || settledKey === keyStr);

  const q = useQuery({
    queryKey: queryKeyFor(key, p),
    queryFn: () => fetchResourceValue(resource, p),
    // sub-ack writes setQueryData, so normally queryFn never runs.
    // It's the fallback when the WS is down.
    initialData: resource.initialData as NonUndefinedGuard<T>,
    // Seeded at epoch 0 so `dataUpdatedAt === 0` means only initialData has been seen.
    initialDataUpdatedAt: 0,
    // With a selector, narrow re-renders to the selected slice: structural
    // sharing keeps a deeply-equal slice's reference, and limiting
    // notifyOnChangeProps to data/error stops the per-push `dataUpdatedAt`
    // bump (which fires on every push) from forcing a re-render. We still read
    // `q.dataUpdatedAt` below for `pending` — reading a prop does not re-enable
    // it once notifyOnChangeProps is an explicit list.
    ...(selectActive ? { select, notifyOnChangeProps: ["data", "error"] as const } : {}),
  });

  const pending = q.dataUpdatedAt === 0;
  useEffect(() => {
    if (gate && !pending && settledKey !== keyStr) setSettledKey(keyStr);
  }, [gate, pending, settledKey, keyStr]);

  // Gate transition render (settled, but the select-scoped sub not applied
  // yet): apply the selector manually so callers always see the slice type.
  const data = (select !== undefined && !selectActive && !pending
    ? select(q.data as T)
    : q.data) as T | S;
  const error = q.error as Error | null;
  const refetchRef = useRef(q.refetch);
  refetchRef.current = q.refetch;

  return useMemo(
    (): ResourceResult<T | S> =>
      pending
        ? { pending: true, error, refetch: () => refetchRef.current().then(() => {}) }
        : { pending: false, data, error, refetch: () => refetchRef.current().then(() => {}) },
    [pending, data, error],
  );
}
