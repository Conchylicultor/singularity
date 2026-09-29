import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  skipToken,
  useQuery,
  type NonUndefinedGuard,
} from "@tanstack/react-query";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  NotificationsClient,
  isTerminalResourceError,
  queryKeyFor,
} from "./notifications-client";
import { slowResourceReportSink } from "./slow-resource-reporter";
import { notePendingMount } from "./pending-mount-tracker";
import { dateAwareReplaceEqualDeep } from "./internal/structural-sharing";
import { toResourceError } from "./resource-error";
import type { ChannelStatuses } from "./notifications-client";
import { canonicalParams } from "@plugins/packages/plugins/canonical-params/core";
import type { FailingResource } from "./resource-error-reporter";
import type { ResourceDescriptor, ResourceError } from "../core";
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
          // One retry for a transient failure — never for a contract refusal
          // (`contract-mismatch` / `unknown-key`): the same bundle sends the
          // same params and is refused the same way; the Reload advice is the
          // remedy, not another request.
          retry: (failureCount, error) =>
            failureCount < 1 && !isTerminalResourceError(error),
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

export function NotificationsProvider({
  children,
  queryClient,
}: NotificationsProviderProps) {
  const qc = queryClient ?? getDefaultQueryClient();
  // NotificationsClient is a singleton for the tab; create on first render.
  const notifications = getOrCreateNotifications(qc);
  return createElement(
    QueryClientProvider,
    { client: qc },
    createElement(
      NotificationsContext.Provider,
      { value: notifications },
      children,
    ),
  );
}

let singleton: NotificationsClient | null = null;
function getOrCreateNotifications(qc: QueryClient): NotificationsClient {
  if (!singleton) singleton = new NotificationsClient(qc);
  return singleton;
}

// Transport hoist: construct the singleton NotificationsClient at the VERY start
// of boot — before any plugin chunk is evaluated — so its leader-election
// `navigator.locks.request` is queued at t≈0. The lock grant callback (which
// calls `new WebSocket()` inside SharedWebSocket) then fires during the first
// main-thread yield (a `loadPlugins` await gap) and the socket opens *during*
// boot instead of ~8s later, after the full app mount. NotificationsProvider
// later calls the same `getOrCreateNotifications`, so it reuses THIS singleton —
// the one-socket-per-origin invariant is preserved (no eager second socket, no
// per-tab WS regression). Constructed against the same default QueryClient the
// provider mounts, so seeded/hydrated cache entries line up.
export function ensureNotificationsClient(): NotificationsClient {
  return getOrCreateNotifications(getDefaultQueryClient());
}

// Context-free accessor for the singleton — usable from Core.Root watchers that
// may mount outside NotificationsProvider (the wedge watchdog). Returns null
// until the provider has created the client (i.e. before first render).
export function getNotificationsClient(): NotificationsClient | null {
  return singleton;
}

export function useNotificationsStatus(): WsStatus {
  const client = useContext(NotificationsContext);
  if (!client)
    throw new Error(
      "useNotificationsStatus must be inside NotificationsProvider",
    );
  const [status, setStatus] = useState(() => client.getStatus());
  useEffect(() => client.subscribeStatus(setStatus), [client]);
  return status;
}

export function useNotificationsChannelStatuses(): ChannelStatuses {
  const client = useContext(NotificationsContext);
  if (!client)
    throw new Error(
      "useNotificationsChannelStatuses must be inside NotificationsProvider",
    );
  const [statuses, setStatuses] = useState(() => client.getChannelStatuses());
  useEffect(() => client.subscribeChannelStatuses(setStatuses), [client]);
  return statuses;
}

/**
 * Every live read on this page currently failing — one entry per
 * `(key, params)` tuple, however many hooks observe it. The health report's
 * "resources failing" row reads it; it empties as reads recover (a push, a
 * retry, the `up-to-date` clear).
 */
export function useFailingResources(): readonly FailingResource[] {
  const client = useContext(NotificationsContext);
  if (!client)
    throw new Error("useFailingResources must be inside NotificationsProvider");
  return useSyncExternalStore(
    (fn) => client.subscribeFailingResources(fn),
    () => client.getFailingResources(),
    () => client.getFailingResources(),
  );
}

// Accessor for the singleton NotificationsClient — consumers (the live-state
// health pane, the wedge watchdog) use it to reach probeMissedUpdates()/
// debugSnapshot()/subscribeDebug(). Must be called inside NotificationsProvider.
export function useNotificationsClient(): NotificationsClient {
  const client = useContext(NotificationsContext);
  if (!client)
    throw new Error(
      "useNotificationsClient must be inside NotificationsProvider",
    );
  return client;
}

// Seed the default query client's cache for a resource before any component
// observes it. Used at boot (the boot snapshot) so the first render reads real
// data synchronously instead of `pending` — no flash, no Suspense. Writes the
// SAME default client NotificationsProvider uses (no `queryClient` prop) via the
// SAME queryKeyFor (over the same canonical params) consumers use, so a later
// useResource adopts the seeded entry (its non-zero dataUpdatedAt makes
// `pending` false immediately). The schema registry (NotificationsClient) is
// untouched — only applyUpdate reads it, and that fires only after a mounted
// useResource calls observe(), which registers the schema first.
//
// A `"boot-and-keep"` key is made resident HERE, before the query exists:
// `setQueryData` builds the query with the client's defaults, and its
// constructor arms the GC timer (5 min) — so `useResource`'s own `gcTime:
// Infinity` (applied only once an observer mounts) would come too late for a
// tuple nobody opens within 5 minutes of boot. A query default registered on
// the key prefix `[key]` reaches every tuple of the key as it is built.
export function hydrateResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params: P | undefined,
  value: unknown,
): void {
  const parsed = resource.schema.parse(value);
  const client = getDefaultQueryClient();
  if (resource.preload === "boot-and-keep") {
    client.setQueryDefaults([resource.key], { gcTime: Infinity });
  }
  client.setQueryData(
    queryKeyFor(
      resource.key,
      params && canonicalParams(params, resource.optionalParams),
    ),
    parsed,
  );
}

// Seed an arbitrary query on the app's default QueryClient before mount — the
// non-resource companion to hydrateResource, for boot tasks that pre-fetch
// plain query data (e.g. endpoints' hydrateEndpoint). The caller owns the key
// shape; this only guarantees the write lands on the SAME client the app's
// QueryClientProvider mounts.
export function hydrateQuery(queryKey: unknown[], data: unknown): void {
  getDefaultQueryClient().setQueryData(queryKey, data);
}

/**
 * Ask for standalone ack frames on (resource, params) for as long as the
 * calling component is mounted — see `NotificationsClient.requestAcks`. For a
 * reader holding optimistic ops whose writes may change nothing it can see
 * (a reorder that only moved other rows, a net-zero write): the server then
 * confirms each such write with a version-less `{ kind: "ack" }` frame instead
 * of shipping nothing. Pair it with a `useResource` on the same tuple.
 */
export function useResourceAcks<P extends ResourceParams = ResourceParams>(
  resource: Pick<
    ResourceDescriptor<unknown, P>,
    "key" | "origin" | "optionalParams"
  >,
  params?: P,
): void {
  const notifications = useContext(NotificationsContext);
  if (!notifications) {
    throw new Error(
      "useResourceAcks must be used within a NotificationsProvider",
    );
  }
  const { key, origin } = resource;
  // The same canonical tuple `useResource` subscribes — see `canonicalParams`.
  const paramsJson = JSON.stringify(
    canonicalParams(params ?? {}, resource.optionalParams),
  );
  useEffect(
    () =>
      notifications.requestAcks(
        key,
        JSON.parse(paramsJson) as ResourceParams,
        origin,
      ),
    [notifications, key, origin, paramsJson],
  );
}

// A read is in exactly one of three states, named by `status` (see
// `../core/resource-status.ts`):
//
//   loading — no value yet, no failure: render the loading state;
//   error   — the read failed: `error` is a typed, NEVER-null `ResourceError`,
//             and `stale` the last value the server vouched for, if one landed;
//   ready   — `data` is a value the server currently vouches for.
//
// A failure is its own state, never a flavour of loading: a surface that only
// asks "is it loading?" spins forever on a read that will never load. The ready
// arm DELIBERATELY OMITS `error` and `stale`: reading either off a narrowed-ready
// result is a tsc error (a `null`-typed field would catch nothing, since `null`
// is assignable to `Error | null`).
//
export type ResourceResult<T> =
  | {
      status: "loading";
      refetch: () => Promise<void>;
    }
  | {
      status: "error";
      error: ResourceError;
      /** The last value the server vouched for, if one ever landed. */
      stale?: T;
      refetch: () => Promise<void>;
    }
  | {
      status: "ready";
      data: T;
      refetch: () => Promise<void>;
    };

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

/**
 * The read's canonical params (`canonicalParams`), `{}` when absent or skipped —
 * one identity per canonical tuple, so every effect keyed on it re-runs only
 * when the tuple does.
 */
function useCanonicalParams(
  params: ResourceParams | null | undefined,
  optional: readonly string[] | undefined,
): ResourceParams {
  const json = JSON.stringify(
    params == null ? {} : canonicalParams(params, optional),
  );
  return useMemo(() => JSON.parse(json) as ResourceParams, [json]);
}

/** A skipped read (`params === null`) has nothing to refetch. */
const SKIPPED_REFETCH = (): Promise<void> => Promise.resolve();
/** The second query-key element of a skipped read — never a params object. */
const SKIPPED_KEY = "\0skipped";

// AGENT RULE: Never cast the `data` returned by useResource (e.g. `data as Foo[]`).
// `data` is only accessible after narrowing to `result.status === "ready"`.
// The generic T is inferred from the ResourceDescriptor — casting silently hides type
// mismatches between the resource payload and your assumption.
//
// `params === null` is the substrate's SKIP — "there is no subject to read yet"
// (public spelling: `useLive(value, null)`, `useLiveRow(c, null)`). Every hook
// still runs (the call site's hook order is stable while its params flip), but
// nothing is read: no subscription, no HTTP read or cold-start prime, and no
// pending-mount count (the page is not waiting on the server for it). The query
// sits on a per-key skip key whose `queryFn` is React Query's `skipToken`, so no
// refetch path can run it. The result is the loading arm, for as
// long as the params stay `null`.
export function useResource<T, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P | null,
): ResourceResult<T>;
export function useResource<T, S, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params: P | undefined | null,
  options: UseResourceOptions<T, S>,
): ResourceResult<S>;
export function useResource<T, S, P extends ResourceParams = ResourceParams>(
  resource: ResourceDescriptor<T, P>,
  params?: P | null,
  options?: UseResourceOptions<T, S>,
): ResourceResult<T | S> {
  const notifications = useContext(NotificationsContext);
  if (!notifications) {
    throw new Error("useResource must be used within a NotificationsProvider");
  }
  const key = resource.key;
  const origin = resource.origin;
  const skipped = params === null;
  // Canonical: one logical read is one tuple on every path it takes (the sub,
  // the HTTP fallback URL, the prime, the query key) — see `canonicalParams`.
  const p = useCanonicalParams(params, resource.optionalParams);

  // Measure mount→settle so a domain plugin can report slow resources. Reported
  // once, the first time `pending` flips true→false (see effect below).
  const startRef = useRef<number | null>(null);
  const reportedRef = useRef(false);

  const schema = resource.schema;
  const select = options?.select;
  const gate = options?.gate === true;

  // Refcount sub/unsub on mount/unmount. `p` keeps its identity per canonical
  // tuple (`useCanonicalParams`), so it is a stable dep however callers spell
  // their params object.
  const keyOf = resource.keyed?.keyOf;
  useEffect(() => {
    if (skipped) return;
    startRef.current = performance.now();
    notifications.observe(key, p, origin, schema, keyOf);
    return () => notifications.unobserve(key, p, origin);
  }, [notifications, key, origin, schema, keyOf, skipped, p]);

  // `gate`: keep the subscription un-scoped until this (key, params) has
  // settled once, so the pending→settled flip is guaranteed to re-render (a
  // select-scoped sub flips silently when the slice is identical across the
  // boundary). Keyed by query key so a param change re-gates.
  // A skipped read's key is per resource key (never shared across descriptors,
  // whose options differ) and can never collide with a params tuple.
  const queryKey = skipped ? [key, SKIPPED_KEY] : queryKeyFor(key, p);
  const keyStr = JSON.stringify(queryKey);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const selectActive =
    !skipped && select !== undefined && (!gate || settledKey === keyStr);

  const q = useQuery({
    queryKey,
    // THE single HTTP write path: version-guarded, shared with the cold-start
    // prime (notifications-client.ts `fetchOverHttp`). Runs as the WS-down
    // fallback and the invalidate-mode post-invalidate refetch; the sub-ack
    // normally fills the cache so this rarely runs. Errors propagate to `q.error`.
    // A skipped read has nothing to fetch: `skipToken` keeps every refetch path
    // (a manual one, `refetchQueries`, the on-demand `enabled` default) off it.
    queryFn: skipped
      ? skipToken
      : () => notifications.fetchOverHttp(key, p, origin, schema, "fallback"),
    // sub-ack writes setQueryData, so normally queryFn never runs.
    // It's the fallback when the WS is down.
    // A typed placeholder, never a value: seeded at epoch 0 so
    // `dataUpdatedAt === 0` means only the placeholder has been seen. A
    // descriptor without one (a `liveValue`) seeds nothing — the query simply
    // has no data, still `dataUpdatedAt === 0`, still `pending`.
    initialData: (skipped
      ? undefined
      : resource.initialData) as NonUndefinedGuard<T>,
    initialDataUpdatedAt: 0,
    // With no placeholder, React Query would fetch on mount (a query with no
    // data always loads). The WS sub-ack is what fills the cache — the HTTP
    // `queryFn` is only the fallback — so such a query stays disabled until a
    // value lands (then `invalidate` refetches behave as for any other). That is
    // exactly a placeholder query's behavior under `staleTime: Infinity`. A
    // manual `refetch()` ignores `enabled`.
    //
    // An on-demand resource is the exception: its value NEVER rides the socket
    // (no sub-ack value, only `invalidate` frames), so HTTP is its read path,
    // not a fallback — it fetches on mount like any enabled query.
    ...(!skipped &&
    resource.initialData === undefined &&
    resource.load !== "on-demand"
      ? {
          enabled: (query: { state: { data: unknown } }) =>
            query.state.data !== undefined,
        }
      : {}),
    // Date-aware structural sharing for EVERY resource (with or without
    // `select`): RQ applies the query's `structuralSharing` to both the
    // query-data merge AND the select-result memoization. The default
    // `replaceEqualDeep` treats `Date` instances as opaque (so a deeply-equal
    // payload that carries `z.coerce.date()` fields still mints a new reference
    // on every push), defeating the documented slice-selector dedup. This is
    // strictly stronger dedup, never weaker.
    structuralSharing: dateAwareReplaceEqualDeep,
    // A `"boot-and-keep"` resource is never garbage-collected: its value must
    // survive the windows where nothing observes it, otherwise the next mount
    // reads `dataUpdatedAt === 0` — pending again, long after boot said it was
    // known. A tuple the boot hydrated got the same default before it was built
    // (`hydrateResource`); this covers one a tab subscribes without a hydrate.
    ...(!skipped && resource.preload === "boot-and-keep"
      ? { gcTime: Infinity }
      : {}),
    // With a selector, narrow re-renders to the selected slice: structural
    // sharing keeps a deeply-equal slice's reference, and limiting
    // notifyOnChangeProps to data/error stops the per-push `dataUpdatedAt`
    // bump (which fires on every push) from forcing a re-render. We still read
    // `q.dataUpdatedAt` below for `pending` — reading a prop does not re-enable
    // it once notifyOnChangeProps is an explicit list.
    ...(selectActive
      ? { select, notifyOnChangeProps: ["data", "error"] as const }
      : {}),
  });

  // `hasValue` — a real value has landed at least once (`dataUpdatedAt` leaves
  // epoch 0 only on a successful load). `settled` narrows it to "a trustworthy
  // value now": loaded AND not errored. The internal branches below key off
  // `hasValue`, not `settled`, so an error does not re-select `initialData`,
  // re-prime, or re-time the mount→settle metric. A skipped read has neither.
  const hasValue = !skipped && q.dataUpdatedAt !== 0;
  // The one typed failure (memoized per raw error, so every observer of the
  // query shares one `ResourceError` identity).
  const error =
    skipped || q.error === null ? null : toResourceError(q.error);
  const settled = hasValue && error === null;

  // Cold-start accelerator: if this resource mounts before the live-state
  // transport has EVER been ready (a cold deep-link — the notifications socket is
  // starved for seconds by main-thread saturation), fetch the first value over
  // plain HTTP in parallel with the socket coming up, so content settles ~2.5s
  // sooner instead of waiting on the batched WS sub-ack. Fires at most once per
  // (key,params), only while still pending (no hydrated/boot-snapshot value), and
  // only on genuine cold start. Warm navigations (transport already opened once)
  // skip this entirely, so the warm path is unchanged. The later WS sub-ack
  // reconciles via the shared version guard.
  const primedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (hasValue || skipped) return;
    if (notifications.hasEverBeenReady(origin)) return;
    if (primedKeyRef.current === keyStr) return;
    primedKeyRef.current = keyStr;
    void notifications.primeFromHttp(key, p, origin);
  }, [hasValue, skipped, keyStr, notifications, key, origin, p]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate first-settle transition: a one-way latch deliberately held as state for a (key,params) pair; the unsettled→settled flip MUST cause a re-render so the notifyOnChangeProps select-narrowing takes effect next render — a ref would silently skip that re-render and break the gate; there is no external store to subscribe to and it cannot be derived in render
    if (gate && settled && settledKey !== keyStr) setSettledKey(keyStr);
  }, [gate, settled, settledKey, keyStr]);

  // Count this read as "still waiting for data" from mount until its first value
  // lands (the cleanup runs on the `hasValue` flip, on unmount, and on a key
  // change). The page-wide count is how a page load or a navigation knows it is
  // on screen — see pending-mount-tracker.ts. Keyed on `hasValue`, not
  // `pending`: a transient error does not make the page "loading again".
  // A skipped read waits on nothing, so it is never counted.
  useEffect(() => {
    if (hasValue || skipped) return;
    return notePendingMount(key);
  }, [hasValue, skipped, key, keyStr]);

  // Report the mount→settle duration once, the first time this resource leaves
  // `pending`. live-state stays threshold-agnostic — the registered reporter (a
  // domain plugin) decides what counts as slow.
  useEffect(() => {
    if (hasValue && !reportedRef.current) {
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
      slowResourceReportSink.emit({
        key,
        params: p,
        durationMs: start === null ? 0 : performance.now() - start,
        transportColdStart,
        transportWaitMs,
      });
    }
  }, [hasValue, notifications, key, p]);

  // Gate transition render (settled, but the select-scoped sub not applied
  // yet): apply the selector manually so callers always see the slice type.
  // Keyed on `hasValue`, not `settled`: a transient error unsettles the read
  // while `q.data` still holds the last authoritative value, and re-selecting
  // `initialData` there would blank the slice.
  const data = (
    select !== undefined && !selectActive && hasValue
      ? select(q.data as T)
      : q.data
  ) as T | S;
  // Last-known-good for the error arm: the SELECTED slice (same expression as
  // `data`) once a value has landed, else `undefined` — a first-load failure has
  // no trustworthy value to expose.
  const stale = hasValue ? data : undefined;
  const refetchRef = useLatestRef(q.refetch);

  // The result identity recomputes only on data/error/stale (which decide the
  // status); the returned `refetch` reads the freshest `q.refetch` off the
  // stable `refetchRef.current` at call time. A skipped read (`params ===
  // null`, no subject yet) is `loading` with nothing to refetch.
  return useMemo((): ResourceResult<T | S> => {
    if (skipped) return { status: "loading", refetch: SKIPPED_REFETCH };
    const refetch = () => refetchRef.current().then(() => {});
    if (error !== null) {
      return stale === undefined
        ? { status: "error", error, refetch }
        : { status: "error", error, stale, refetch };
    }
    if (!hasValue) {
      return { status: "loading", refetch };
    }
    return { status: "ready", data, refetch };
  }, [skipped, hasValue, data, error, stale]);
}
