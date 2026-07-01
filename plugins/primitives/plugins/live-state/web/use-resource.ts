import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type NonUndefinedGuard,
} from "@tanstack/react-query";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { NotificationsClient, queryKeyFor } from "./notifications-client";
import { reportSlowResource } from "./slow-resource-reporter";
import { dateAwareReplaceEqualDeep } from "./internal/structural-sharing";
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

// Seed an arbitrary query on the app's default QueryClient before mount — the
// non-resource companion to hydrateResource, for boot tasks that pre-fetch
// plain query data (e.g. endpoints' hydrateEndpoint). The caller owns the key
// shape; this only guarantees the write lands on the SAME client the app's
// QueryClientProvider mounts.
export function hydrateQuery(queryKey: unknown[], data: unknown): void {
  getDefaultQueryClient().setQueryData(queryKey, data);
}

export type ResourceResult<T> =
  | { pending: true; error: Error | null; refetch: () => Promise<void> }
  | { pending: false; data: T; error: Error | null; refetch: () => Promise<void> };

// Shared HTTP fetch for a resource. Used by useResource's queryFn as the WS-down
// fallback and by invalidate-mode resources' post-invalidate refetch; the sub-ack
// normally fills the cache so this rarely runs.
//
// Conditional revalidation: when the resource declares `revalidate` and we hold a
// prior ETag, send `If-None-Match`. A `304` means "still current" — keep the
// value already in the cache instead of re-parsing a fresh body (the loader never
// ran server-side). Otherwise store the response's fresh `ETag` for next time.
// A resource without `revalidate` has no stored ETag → no header → byte-identical
// to the old unconditional GET.
async function fetchResourceValue<T, P extends ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  p: ResourceParams,
  notifications: NotificationsClient,
): Promise<T> {
  const qs = new URLSearchParams(p).toString();
  const base = resource.origin === "central" ? "/api/central-resources" : "/api/resources";
  const url = `${base}/${encodeURIComponent(resource.key)}${qs ? `?${qs}` : ""}`;
  const etag = notifications.etagFor(resource.key, p, resource.origin);
  const res = await fetch(url, etag !== undefined ? { headers: { "If-None-Match": etag } } : undefined);
  if (res.status === 304) {
    const cached = notifications.getCachedResource(resource.key, p);
    // Keep the cached value (same reference — structural sharing sees no change).
    if (cached !== undefined) return cached as T;
    // Defensive: 304 with no cached base (shouldn't happen — we only send an ETag
    // when we hold a value). Re-fetch unconditionally so the cache is never left
    // empty by a needless 304.
    const fresh = await fetch(url);
    if (!fresh.ok) throw new Error(`Resource ${resource.key} fetch failed: ${fresh.status}`);
    const body = (await fresh.json()) as { value: unknown; version: number };
    notifications.noteHttpEtag(resource.key, p, resource.origin, fresh.headers.get("ETag"));
    return resource.schema.parse(body.value) as T;
  }
  if (!res.ok) throw new Error(`Resource ${resource.key} fetch failed: ${res.status}`);
  const body = (await res.json()) as { value: unknown; version: number };
  notifications.noteHttpEtag(resource.key, p, resource.origin, res.headers.get("ETag"));
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

  // Measure mount→settle so a domain plugin can report slow resources. Reported
  // once, the first time `pending` flips true→false (see effect below).
  const startRef = useRef<number | null>(null);
  const reportedRef = useRef(false);

  const schema = resource.schema;
  const select = options?.select;
  const gate = options?.gate === true;

  // Refcount sub/unsub on mount/unmount.
  useEffect(() => {
    startRef.current = performance.now();
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
    queryFn: () => fetchResourceValue(resource, p, notifications),
    // sub-ack writes setQueryData, so normally queryFn never runs.
    // It's the fallback when the WS is down.
    initialData: resource.initialData as NonUndefinedGuard<T>,
    // Seeded at epoch 0 so `dataUpdatedAt === 0` means only initialData has been seen.
    initialDataUpdatedAt: 0,
    // Date-aware structural sharing for EVERY resource (with or without
    // `select`): RQ applies the query's `structuralSharing` to both the
    // query-data merge AND the select-result memoization. The default
    // `replaceEqualDeep` treats `Date` instances as opaque (so a deeply-equal
    // payload that carries `z.coerce.date()` fields still mints a new reference
    // on every push), defeating the documented slice-selector dedup. This is
    // strictly stronger dedup, never weaker.
    structuralSharing: dateAwareReplaceEqualDeep,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate first-settle transition: a one-way latch deliberately held as state for a (key,params) pair; the unsettled→settled flip MUST cause a re-render so the notifyOnChangeProps select-narrowing takes effect next render — a ref would silently skip that re-render and break the gate; there is no external store to subscribe to and it cannot be derived in render
    if (gate && !pending && settledKey !== keyStr) setSettledKey(keyStr);
  }, [gate, pending, settledKey, keyStr]);

  // Report the mount→settle duration once, the first time this resource leaves
  // `pending`. live-state stays threshold-agnostic — the registered reporter (a
  // domain plugin) decides what counts as slow.
  useEffect(() => {
    if (!pending && !reportedRef.current) {
      reportedRef.current = true;
      // Cold-start attribution (additive, never suppressing): was the transport
      // NOT yet ready when this resource mounted, and how much of the settle
      // window did it spend waiting for the transport to first become ready?
      const start = startRef.current;
      const firstReadyAt = notifications.getFirstReadyAt();
      const transportColdStart =
        start !== null && (firstReadyAt === null || firstReadyAt >= start);
      const transportWaitMs =
        start === null
          ? 0
          : firstReadyAt === null
            ? performance.now() - start
            : Math.max(0, Math.min(firstReadyAt, performance.now()) - start);
      reportSlowResource({
        key,
        params: p,
        durationMs: start === null ? 0 : performance.now() - start,
        transportColdStart,
        transportWaitMs,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stringify params for stable dep; mirrors the observe effect above
  }, [pending, key, JSON.stringify(p)]);

  // Gate transition render (settled, but the select-scoped sub not applied
  // yet): apply the selector manually so callers always see the slice type.
  const data = (select !== undefined && !selectActive && !pending
    ? select(q.data as T)
    : q.data) as T | S;
  const error = q.error as Error | null;
  const refetchRef = useLatestRef(q.refetch);

  // The result identity recomputes only on pending/data/error; the returned
  // `refetch` reads the freshest `q.refetch` off the stable `refetchRef.current`
  // at call time.
  return useMemo(
    (): ResourceResult<T | S> =>
      pending
        ? { pending: true, error, refetch: () => refetchRef.current().then(() => {}) }
        : { pending: false, data, error, refetch: () => refetchRef.current().then(() => {}) },
    [pending, data, error],
  );
}
