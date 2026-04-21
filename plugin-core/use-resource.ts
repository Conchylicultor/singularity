import { createContext, createElement, useContext, useEffect, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { NotificationsClient, queryKeyFor } from "./notifications-client";

type ResourceParams = Record<string, string>;

// Symbol-branded type so `Resource<T, P>` on the server can be imported on the
// client (as a type) without pulling server code. In practice plugins will
// share a tiny module that exports the Resource descriptor.
export interface ResourceDescriptor<T, P extends ResourceParams = ResourceParams> {
  key: string;
  /** Phantom — never read at runtime, only exists for type inference. */
  readonly __types?: { value: T; params: P };
}

export function resourceDescriptor<T, P extends ResourceParams = ResourceParams>(
  key: string,
): ResourceDescriptor<T, P> {
  return { key };
}

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

// AGENT RULE: Never cast the `data` returned by useResource (e.g. `data as Foo[]`).
// The generic T is inferred from the ResourceDescriptor — casting silently hides type
// mismatches between the resource payload and your assumption.
// If you believe a cast is necessary, STOP and report the exact resource + expected type
// to the user before writing any code, so the resource definition can be fixed instead.
export function useResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P,
): UseQueryResult<T> {
  const notifications = useContext(NotificationsContext);
  if (!notifications) {
    throw new Error("useResource must be used within a NotificationsProvider");
  }
  const key = resource.key;
  const p = (params ?? ({} as P)) as ResourceParams;

  // Refcount sub/unsub on mount/unmount.
  useEffect(() => {
    notifications.observe(key, p);
    return () => notifications.unobserve(key, p);
    // Stringify params for stable dependency; callers are expected to pass
    // stable shapes (small flat objects of strings).
  }, [notifications, key, JSON.stringify(p)]);

  return useQuery<T>({
    queryKey: queryKeyFor(key, p),
    queryFn: async () => {
      const qs = new URLSearchParams(p).toString();
      const url = `/api/resources/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Resource ${key} fetch failed: ${res.status}`);
      const body = (await res.json()) as { value: T; version: number };
      return body.value;
    },
    // sub-ack writes setQueryData, so normally queryFn never runs.
    // It's the fallback when the WS is down.
  });
}
