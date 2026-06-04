import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useSuspenseQuery,
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

export type ResourceResult<T> =
  | { pending: true; error: Error | null; refetch: () => Promise<void> }
  | { pending: false; data: T; error: Error | null; refetch: () => Promise<void> };

// Shared HTTP fetch for a resource. Used by useResource's queryFn (the WS-down
// fallback) and by useSuspenseResource, where it drives the initial load while
// the component is suspended — a suspended component's observe() effect hasn't
// committed, so the WS sub-ack isn't available yet.
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

// AGENT RULE: Never cast the `data` returned by useResource (e.g. `data as Foo[]`).
// `data` is only accessible after narrowing `result.pending === false`.
// The generic T is inferred from the ResourceDescriptor — casting silently hides type
// mismatches between the resource payload and your assumption.
export function useResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P,
): ResourceResult<T> {
  const notifications = useContext(NotificationsContext);
  if (!notifications) {
    throw new Error("useResource must be used within a NotificationsProvider");
  }
  const key = resource.key;
  const origin = resource.origin;
  const p = (params ?? ({} as P)) as ResourceParams;

  const schema = resource.schema;

  // Refcount sub/unsub on mount/unmount.
  useEffect(() => {
    notifications.observe(key, p, origin, schema);
    return () => notifications.unobserve(key, p, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stringify params for stable dep; callers pass small flat objects
  }, [notifications, key, origin, schema, JSON.stringify(p)]);

  const q = useQuery({
    queryKey: queryKeyFor(key, p),
    queryFn: () => fetchResourceValue(resource, p),
    // sub-ack writes setQueryData, so normally queryFn never runs.
    // It's the fallback when the WS is down.
    initialData: resource.initialData as NonUndefinedGuard<T>,
    // Seeded at epoch 0 so `dataUpdatedAt === 0` means only initialData has been seen.
    initialDataUpdatedAt: 0,
  });

  const pending = q.dataUpdatedAt === 0;
  const data = q.data;
  const error = q.error as Error | null;
  const refetchRef = useRef(q.refetch);
  refetchRef.current = q.refetch;

  return useMemo(
    (): ResourceResult<T> =>
      pending
        ? { pending: true, error, refetch: () => refetchRef.current().then(() => {}) }
        : { pending: false, data, error, refetch: () => refetchRef.current().then(() => {}) },
    [pending, data, error],
  );
}

// Suspending variant of useResource. Instead of exposing a `pending` flag with
// default/initial data, it SUSPENDS until the resource has real data, so callers
// render under a <Suspense fallback> while loading rather than flashing defaults.
//
// Unlike useResource it deliberately does NOT seed `initialData`: initialData marks
// the query "success" immediately, which would defeat suspense. The promise thrown
// by useSuspenseQuery is resolved by the HTTP fetch (queryFn). Once the component
// mounts, the observe() effect below subscribes over the WS and keeps the cached
// value live via setQueryData, exactly like useResource.
export function useSuspenseResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P,
): T {
  const notifications = useContext(NotificationsContext);
  if (!notifications) {
    throw new Error("useSuspenseResource must be used within a NotificationsProvider");
  }
  const key = resource.key;
  const origin = resource.origin;
  const p = (params ?? ({} as P)) as ResourceParams;
  const schema = resource.schema;

  // Refcount sub/unsub. Commits only after suspense resolves and the component
  // mounts; thereafter WS pushes keep the cached value live.
  useEffect(() => {
    notifications.observe(key, p, origin, schema);
    return () => notifications.unobserve(key, p, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stringify params for stable dep; callers pass small flat objects
  }, [notifications, key, origin, schema, JSON.stringify(p)]);

  const q = useSuspenseQuery({
    queryKey: queryKeyFor(key, p),
    queryFn: () => fetchResourceValue(resource, p),
    // No initialData → the query starts pending → useSuspenseQuery throws until
    // the first real value lands (HTTP fetch or WS sub-ack).
  });

  return q.data;
}
