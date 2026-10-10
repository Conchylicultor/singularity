import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import {
  useResource,
  type PagedResourceResult,
  type ResourceDescriptor,
  type ResourceError,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type {
  LiveAllCollection,
  LiveCollection,
  LiveCountedCollection,
  LiveCountQuery,
  LiveGroup,
  LiveGroupableColumn,
  LiveGroupQuery,
  LiveGroupValue,
  LiveQuery,
  LivePagedValue,
  LivePlainValue,
  LiveQueryValue,
  LiveRowsCollection,
  LiveValue,
  LiveValueOrigin,
} from "@plugins/network/plugins/live/core";
import { isPointId } from "@plugins/network/plugins/live/core";
import {
  useLivePages,
  type LivePagesOptions,
  type LivePagesResult,
} from "./use-live-pages";
import { withoutWindowFields } from "./window-fields";

// The read half of a `liveCollection`. A consumer asks a QUERY — a window
// (`where` / `orderBy` / `limit`), a grouping (`groupBy`) or an explicit id set
// — and never picks the wire resource or its params: the window goes to `key`,
// a grouping to `:groups`, an id set to the `:rows` point sibling, and the
// encoding is the declaration's own codec. A grouping is a window over the
// grouped relation, so it shares the window's result and grow logic; only a
// read whose result has different STATES (`useLiveRow`) gets its own hook.
// A `liveValue` is read by the same hook: its result is `ResourceResult<T>`,
// the states every read already has, so it gets no hook of its own.

/**
 * A window read: the paged read every grow-able read returns. `canGrow` is
 * "the window is full and below `maxLimit`", `loadMore()` grows it by one
 * default page (clamped to `maxLimit`), and a grow that FAILS is the error arm
 * with the window it grew from as `stale`.
 */
export type LiveListResult<Row> = PagedResourceResult<Row>;

/** An explicit id set. Rows come back for the ids that exist; no filter applies. */
export interface LiveIdsQuery {
  ids: readonly string[];
}

/**
 * A derived slice of a collection declared `all` (`useLive(all, { select })`).
 * The read re-renders only when the SELECTED value changes (structurally
 * compared), so a reader of one fact about the set (a count, one row's field)
 * is not re-rendered by a push that leaves that fact alone. Pass a stable
 * function (`useCallback`, or one at module level): a new one each render is
 * re-run each render.
 */
export interface LiveAllSelect<Row, S> {
  select: (rows: Row[]) => S;
}

/**
 * One row by id: loading, failed, found, or determinately absent — `ready`
 * splits on `found`. `pending` is the pre-`status` spelling (see
 * `ResourceResult`), kept while the tree migrates.
 */
export type LiveRowResult<Row> =
  | {
      status: "loading";
      refetch: () => Promise<void>;
    }
  | {
      status: "error";
      error: ResourceError;
      /** The row as last seen, if it was ever seen. */
      stale?: Row;
      refetch: () => Promise<void>;
    }
  | {
      status: "ready";
      found: true;
      row: Row;
      refetch: () => Promise<void>;
    }
  | {
      status: "ready";
      found: false;
      refetch: () => Promise<void>;
    };

type AnyDescriptor = ResourceDescriptor<unknown, Record<string, string>>;

/**
 * A growable list query, reduced to what the grow logic needs: the resource,
 * how to encode it at a given limit, the limit asked for, and the step / cap a
 * grow moves by. `base` (the query WITHOUT its limit, canonically encoded)
 * identifies which list a grow belongs to.
 */
interface ListShape {
  descriptor: AnyDescriptor;
  base: string;
  encode: (limit: number) => Record<string, string>;
  askedLimit: number;
  step: number;
  maxLimit: number;
}

function listShape<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S>,
  query: LiveQuery<F, S> | LiveGroupQuery<F> | undefined,
): ListShape {
  if (query && "groupBy" in query && query.groupBy !== undefined) {
    const codec = collection.groups.groups;
    // `groupBy` present ⇒ the group arm (a window query types it `never`).
    const groupQuery = query as LiveGroupQuery<F>;
    // The WHOLE query goes to the codec (limit replaced), so a stray `orderBy`
    // from an untyped caller throws there instead of being dropped here.
    const encode = (limit: number) => codec.encode({ ...groupQuery, limit });
    return {
      descriptor: collection.groups as AnyDescriptor,
      // `groupBy` rides in `base`, so a grow never outlives a change of column.
      base: JSON.stringify(["groups", encode(1)]),
      encode,
      askedLimit: query.limit ?? codec.defaultLimit,
      step: codec.defaultLimit,
      maxLimit: codec.maxLimit,
    };
  }
  const codec = collection.window.window;
  const { where, orderBy, columns } = (query ?? {}) as LiveQuery<F, S>;
  return {
    descriptor: collection.window as AnyDescriptor,
    base: JSON.stringify(["window", codec.encode({ where, orderBy, columns })]),
    encode: (limit) => codec.encode({ where, orderBy, columns, limit }),
    askedLimit: query?.limit ?? codec.defaultLimit,
    step: codec.defaultLimit,
    maxLimit: codec.maxLimit,
  };
}

/**
 * Read a live collection. The QUERY's shape picks what is read — a consumer
 * never names a wire resource or its params.
 *
 * - `useLive(c)` / `useLive(c, { where, orderBy, limit })` — a bounded window.
 *   Its settled arm adds `canGrow` / `growing` / `loadMore()`; while a grown
 *   window loads, the hook STAYS settled on the previous rows (`growing: true`)
 *   — those rows are server-vouched and still subscribed — so `if (pending)`
 *   never flashes a spinner over a list that already rendered.
 * - `useLive(c, { groupBy, where?, limit? })` — the values a text / number /
 *   boolean filterable column takes (with counts), ordered by count desc then
 *   value; each value typed as the row field. The same list result
 *   as a window: `loadMore()` pages through groups.
 * - `useLive(c, { count: true, where? })` — how many rows match `where`, as
 *   `ResourceResult<number>`, kept live; only on a collection declared
 *   `count: true`. `null` in place of the query (or of both) reads nothing
 *   (pending) — for a surface whose count is not cheap right now (a search is
 *   on), or that has no collection to count.
 * - `useLive(c, { ids })` — an explicit id set, via the `:rows` point sibling.
 *   No paging fields: an id set is not a window. The one list-free read, so it
 *   (and `useLiveRow`) also takes a lookup-only collection; a window or
 *   grouping read of one is a tsc error — it declares no order to list in.
 */
/**
 * A value's params argument: absent for a param-less value (`P` is
 * `Record<string, never>` — no declared name), required otherwise — the
 * declared names (each a string, an optional one may be left out), or `null`
 * when there is no subject to read yet.
 */
type LiveValueArgs<P> = string extends keyof P
  ? []
  : [keyof P] extends [never]
    ? []
    : [params: P | null];

// The window overload comes FIRST: an argument like `where: or(...)` is a
// generic call TypeScript checks once, against the first overload's contextual
// type — so that type must be the collection's own `LiveWhere` for the tree's
// columns and operands to be checked against the declaration.
export function useLive<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S>,
  query?: LiveQuery<F, S>,
): LiveListResult<Row>;
export function useLive<
  Row,
  F,
  S extends string,
  const G extends LiveGroupableColumn<F>,
>(
  collection: LiveCollection<Row, F, S>,
  query: LiveGroupQuery<F, G>,
): LiveListResult<LiveGroup<LiveGroupValue<Row, G>>>;
export function useLive<Row, F, S extends string>(
  collection: LiveCountedCollection<Row, F, S> | null,
  query: LiveCountQuery<F> | null,
): ResourceResult<number>;
/**
 * - `useLive(all)` — a collection declared `all`: every row, in its declared
 *   order, as `ResourceResult<Row[]>` (settled on its first render when the
 *   boot snapshot hydrated it). Read straight off the cache with no row map
 *   and no selector, so `data` IS the cached array — every observer shares it
 *   and its row objects — keeps its identity until a push changes the set, and
 *   a delta keeps the identity of every row it does not change, moved ones
 *   included — consumers memoize on both.
 * - `useLive(all, { select })` — a slice of it (`LiveAllSelect`), re-rendered
 *   only when the slice changes. Gated: its first value always renders,
 *   whatever the slice.
 *
 * An id set of an `all` collection is `useLive(all, { ids })` /
 * `useLiveRow(all, id)`, through its `:rows` point sibling like any other.
 * These overloads come AFTER the window and group ones (an `all` collection
 * has neither, so it never matches them) so a window query's contextual type
 * is still the first overload's.
 */
export function useLive<Row>(
  collection: LiveAllCollection<Row>,
): ResourceResult<Row[]>;
export function useLive<Row, S>(
  collection: LiveAllCollection<Row>,
  options: LiveAllSelect<Row, S>,
): ResourceResult<S>;
export function useLive<Row>(
  collection: LiveRowsCollection<Row>,
  query: LiveIdsQuery,
): ResourceResult<Row[]>;
/**
 * - `useLive(value)` / `useLive(value, params)` — a declared `liveValue`:
 *   `ResourceResult<T>` (pending, then settled; settled on its first render
 *   when the boot snapshot preloaded it). `params` is required exactly when the
 *   value declares params. A central value (`origin: "central"`) reads the
 *   same way; its descriptor routes the subscription to the central socket.
 * - `useLive(value, null)` — a param'd value whose subject has not ARRIVED yet
 *   (an id another read is still loading): `pending` with no error for as long
 *   as it is `null`, and nothing is read — no subscription, no HTTP read, not a
 *   pending mount. A value whose subject is not known yet is not known yet;
 *   one that will NEVER arrive (a missing registration, a legacy record with no
 *   id) is a settled answer the caller renders or throws on itself, never a
 *   `null` read left spinning.
 */
/**
 * - `useLive(pagedValue, query, { first? })` — a cursor-paged value
 *   (`liveValue(key, { query, paged })`): a live chain of pages,
 *   `LivePagesResult<Item, Meta>` — `PagedResourceResult<Item>` plus the first
 *   page's `meta` and `truncated`. `null` reads nothing (loading).
 */
export function useLive<Item, Meta, Q, QIn>(
  value: LivePagedValue<Item, Meta, Q, QIn, LiveValueOrigin>,
  query: NoInfer<QIn> | null,
  options?: LivePagesOptions,
): LivePagesResult<Item, Meta>;
/**
 * - `useLive(queryValue, query)` — a typed-query value
 *   (`liveValue(key, { query })`): the question is the schema's INPUT, encoded
 *   to its one canonical tuple (so an inline literal is fine). `null` reads
 *   nothing (pending), as for a param'd value; a changed question is a new
 *   tuple and shows loading.
 */
export function useLive<T, Q, QIn>(
  value: LiveQueryValue<T, Q, QIn, LiveValueOrigin>,
  query: NoInfer<QIn> | null,
): ResourceResult<T>;
export function useLive<T, P extends Record<string, string>>(
  value: LivePlainValue<T, P, LiveValueOrigin>,
  // `NoInfer`: `P` is the declaration's — a `{ path } | null` argument must not
  // narrow it past a declared optional param.
  ...params: LiveValueArgs<NoInfer<P>>
): ResourceResult<T>;
export function useLive<Row, F, S extends string>(
  source:
    | null
    | LiveCollection<Row, F, S>
    | LiveRowsCollection<Row>
    | LiveAllCollection<Row>
    | LiveValue<unknown, Record<string, string>, LiveValueOrigin>,
  query?:
    | LiveQuery<F, S>
    | LiveGroupQuery<F>
    | LiveCountQuery<F>
    | LiveIdsQuery
    | LiveAllSelect<Row, unknown>
    | Record<string, string>
    | null,
  options?: LivePagesOptions,
):
  | LiveListResult<unknown>
  | ResourceResult<unknown>
  | LivePagesResult<unknown, unknown> {
  // A declaration never changes kind between renders (it is a module-level
  // const), so the branch below keeps the hook order stable. No source is the
  // count overload's skip (the only one that takes `null`).
  if (source === null) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed per call site: only the count overload passes null
    return useCount(null, null);
  }
  if ("live" in source) {
    const decl = source as
      | LiveValue<unknown, Record<string, string>, LiveValueOrigin>
      | LiveQueryValue<unknown, unknown, unknown, LiveValueOrigin>
      | LivePagedValue<unknown, unknown, unknown, unknown, LiveValueOrigin>;
    if ("query" in decl && decl.query !== undefined) {
      if (decl.paged !== undefined) {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- see below: fixed per call site
        return useLivePages(decl, query as unknown, options);
      }
      // eslint-disable-next-line react-hooks/rules-of-hooks -- see below: fixed per call site
      return useQueryValue(decl, query as unknown);
    }
    // `null` is the substrate's skip; `useResource` canonicalizes the params
    // (an absent optional one is one tuple however it is spelled).
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the declaration's kind is fixed for a call site: a module-level const never switches between a value and a collection
    return useResource(
      source,
      query as Record<string, string> | null | undefined,
    );
  }
  // A collection declared `all` reads its whole set — unless the query is an
  // id set, which goes to `:rows` like any collection's. Which of the two a
  // call site asks is fixed by its overload (an `{ ids }` literal or not).
  const all = (source as { all?: LiveAllCollection<Row>["all"] }).all;
  if (all !== undefined && !(query != null && "ids" in query)) {
    const options = (query ?? undefined) as
      LiveAllSelect<Row, unknown> | undefined;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see above: fixed per call site
    return useAll(all, options);
  }
  // A count — or `null`, which only the count overload takes on a collection.
  // Which of the two a call site asks is fixed by its overload.
  if (query === null || (query !== undefined && "count" in query)) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see above: fixed per call site
    return useCount(
      source as LiveCollection<Row, F, S>,
      query as LiveCountQuery<F> | null,
    );
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see above: fixed per call site
  return useCollection(
    source,
    (query ?? undefined) as
      LiveQuery<F, S> | LiveGroupQuery<F> | LiveIdsQuery | undefined,
  );
}

/**
 * A typed-query value: the question encoded through the declaration's own
 * codec (the one its params gate and serve half decode with) — memoized on
 * the encoding, so an inline literal names one tuple across renders.
 */
function useQueryValue<T, Q, QIn>(
  value: LiveQueryValue<T, Q, QIn, LiveValueOrigin>,
  query: QIn | null,
): ResourceResult<T> {
  const q = query === null ? null : value.query.encode(query).q;
  const params = useMemo(() => (q === null ? null : { q }), [q]);
  return useResource(value, params);
}

/**
 * The whole ordered set, straight through `useResource` on its param-less
 * tuple (`{}` — the one boot hydrates): no row map. Always a gated read, so its
 * first value re-renders even when the slice equals what the caller saw
 * before it landed, a push that changes nothing it reads re-renders nothing,
 * and a tuple already cached starts narrowed (the derived latch), so a
 * hydrated read renders once. A plain read hands React Query NO selector
 * (`UseResourceGateOptions`), so its `data` IS the cached array — every
 * observer shares it and its row objects, never a per-observer structurally
 * shared copy. One unconditional call either way (rules of hooks).
 */
function useAll<Row>(
  all: LiveAllCollection<Row>["all"],
  options: LiveAllSelect<Row, unknown> | undefined,
): ResourceResult<unknown> {
  return useResource(all, undefined, { gate: true, select: options?.select });
}

/**
 * A collection's total over `where` through its `:count` sibling — a `null`
 * query (or collection) reads nothing, on {@link SKIPPED_COUNT}: a skipped read
 * never names a resource's params, so a collection with no `:count` may be
 * skipped too.
 */
function useCount<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S> | null,
  query: LiveCountQuery<F> | null,
): ResourceResult<number> {
  const descriptor = collection?.count ?? null;
  if (descriptor === null && query !== null) {
    throw new Error(
      `useLive("${collection?.key ?? "null"}", { count }): the collection is not declared \`count: true\``,
    );
  }
  const paramsKey =
    query === null || descriptor === null
      ? null
      : JSON.stringify(descriptor.count.encode({ where: query.where }));
  const params = useMemo(
    () =>
      paramsKey === null
        ? null
        : (JSON.parse(paramsKey) as Record<string, string>),
    [paramsKey],
  );
  return useResource(
    (descriptor ?? SKIPPED_COUNT) as ResourceDescriptor<
      number,
      Record<string, string>
    >,
    params,
  );
}

/**
 * The descriptor a skipped count reads (always with `null` params, so never
 * subscribed or fetched): never registered, its key no collection can mint.
 */
const SKIPPED_COUNT: ResourceDescriptor<number, Record<string, string>> = {
  key: "network/live:count:skipped",
  schema: z.number(),
  validateParams: () => {
    throw new Error("network/live: the skipped count is never read");
  },
};

function useCollection<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S> | LiveRowsCollection<Row>,
  query?: LiveQuery<F, S> | LiveGroupQuery<F> | LiveIdsQuery,
): LiveListResult<unknown> | ResourceResult<Row[]> {
  const ids = query && "ids" in query ? query.ids : undefined;
  // An id set reads `:rows` alone — it never touches the window codec, which a
  // lookup-only collection does not have. A list query is typed to a full one.
  const shape =
    ids === undefined
      ? listShape(
          collection as LiveCollection<Row, F, S>,
          query as LiveQuery<F, S> | LiveGroupQuery<F> | undefined,
        )
      : null;

  // A grow is forgotten (back to the asked limit) as soon as the query changes.
  const [grown, setGrown] = useState<{
    base: string;
    from: number;
    limit: number;
  } | null>(null);
  const grow = shape !== null && grown?.base === shape.base ? grown : null;
  const limit = grow?.limit ?? shape?.askedLimit ?? 0;

  const idsKey =
    ids === undefined ? null : collection.rows.point.encode(ids).ids;
  const paramsKey = JSON.stringify(
    shape === null ? { ids: idsKey } : shape.encode(limit),
  );
  const prevKey = JSON.stringify(
    grow && shape ? shape.encode(grow.from) : null,
  );
  const params = useMemo(
    () => JSON.parse(paramsKey) as Record<string, string>,
    [paramsKey],
  );

  const descriptor: AnyDescriptor =
    shape === null ? (collection.rows as AnyDescriptor) : shape.descriptor;
  const current = useResource(descriptor, params);

  // The list a grow started from, kept subscribed ONLY while the grown one has
  // no value — loading, or failed before its first (then this collapses onto
  // `params`, a shared refcount, and the old tuple is released).
  const growUnsettled =
    grow !== null &&
    (current.status === "loading" || current.status === "error");
  const prevParams = useMemo(
    () =>
      growUnsettled ? (JSON.parse(prevKey) as Record<string, string>) : params,
    [growUnsettled, prevKey, params],
  );
  const previous = useResource(descriptor, prevParams);

  // The list result keeps its identity (and so does `loadMore`) until what it
  // is built from changes, as `useResource`'s own results do between pushes:
  // consumers memoize on it (a Set of ids built per row of a tree, say). Every
  // input below is a primitive or one of those results — never `shape`, which
  // `listShape` rebuilds on every render.
  const base = shape?.base ?? null;
  const step = shape?.step ?? 0;
  const maxLimit = shape?.maxLimit ?? 0;
  const loadMore = useCallback(() => {
    const next = Math.min(limit + step, maxLimit);
    if (base === null || next === limit) return;
    setGrown({ base, from: limit, limit: next });
  }, [base, limit, step, maxLimit, setGrown]);
  // A scroll collection's window rows carry `$key`, a scoped one's `$scoped`;
  // a list read hands rows out without them (a grouping's rows never have one).
  const strip =
    shape !== null &&
    shape.descriptor === (collection as { window?: unknown }).window &&
    ((collection as { scroll?: boolean }).scroll === true ||
      ((collection as { columnScope?: string | null }).columnScope ?? null) !==
        null);
  const rowsOf = useCallback(
    (data: unknown[]): unknown[] =>
      strip ? data.map(withoutWindowFields) : data,
    [strip],
  );
  const list = useMemo((): LiveListResult<unknown> => {
    switch (current.status) {
      case "ready": {
        const data = rowsOf(current.data as unknown[]);
        return {
          ...current,
          data,
          canGrow: data.length === limit && limit < maxLimit,
          growing: false,
          loadMore,
        };
      }
      case "loading":
        // A grow in flight stays READY on the rows it grew from — those are
        // server-vouched and still subscribed — so the list never flashes a
        // spinner over rows it already rendered.
        if (growUnsettled && previous.status === "ready") {
          return {
            status: "ready",
            data: rowsOf(previous.data as unknown[]),
            refetch: previous.refetch,
            canGrow: false,
            growing: true,
            loadMore,
          };
        }
        return current as LiveListResult<unknown>;
      case "error":
        // A grow that failed before its first value: the error, with the
        // window it grew from as `stale` (a surface can keep showing it).
        if (
          growUnsettled &&
          current.stale === undefined &&
          previous.status === "ready"
        ) {
          return {
            status: "error",
            error: current.error,
            stale: rowsOf(previous.data as unknown[]),
            refetch: current.refetch,
          };
        }
        // The last-known rows on the error arm are handed out like ready
        // ones — without the window fields.
        return (
          current.stale === undefined
            ? current
            : { ...current, stale: rowsOf(current.stale as unknown[]) }
        ) as LiveListResult<unknown>;
    }
  }, [growUnsettled, previous, current, limit, maxLimit, loadMore, rowsOf]);

  if (shape === null) return current as ResourceResult<Row[]>;
  return list;
}

/**
 * The no-row answer — a `null` id, or one no point set can carry (empty, or
 * holding a `,`): no row is addressable by it, and there is nothing to refetch.
 */
const NO_ID: LiveRowResult<never> = {
  status: "ready",
  found: false,
  refetch: () => Promise.resolve(),
};

/**
 * Read one row of a live collection by id: `loading`, then `ready` with
 * `found: true` and the row, or `found: false` when the server answered and no
 * such row exists — a determinate answer, never a spinner — or `error` when the
 * read failed (with the row as last seen, as `stale`). Reads the `:rows` point
 * sibling, so it ignores every window filter and bound: it answers "does this
 * row exist".
 *
 * A `null` id (nothing to look up yet) is `found: false` from the first render
 * and reads nothing (the substrate's skip — no subscription, not a pending
 * mount): no id names no row. So is an id the point codec cannot carry (`""`,
 * or one holding a `,` — the wire set is comma-joined): no row can be
 * addressed by it, so the answer is as determinate as for `null`. A reader
 * handed an id from outside (a URL, a `[[page:…]]` token, an agent's tool
 * input) therefore renders its not-found state, never a render error.
 */
export function useLiveRow<Row>(
  collection: LiveRowsCollection<Row>,
  id: string | null,
): LiveRowResult<Row> {
  const absent = id === null || !isPointId(id);
  const idsKey = absent ? null : collection.rows.point.encode([id]).ids;
  const params = useMemo(
    () => (idsKey === null ? null : { ids: idsKey }),
    [idsKey],
  );
  const result = useResource(collection.rows, params);
  // The result keeps its identity until what it is built from changes, like
  // `useLive`'s list result: consumers memoize on it. `useResource`'s own
  // result changes only with its status / data / error / stale.
  return useMemo((): LiveRowResult<Row> => {
    // Determinate without the server: no (carriable) id names no row.
    if (absent) return NO_ID;
    const { refetch } = result;
    switch (result.status) {
      case "loading":
        return result;
      case "error": {
        // A one-id tuple's payload is `[row]` or `[]` — its stale one included.
        const stale = result.stale?.[0];
        return stale === undefined
          ? { status: "error", error: result.error, refetch }
          : {
              status: "error",
              error: result.error,
              stale,
              refetch,
            };
      }
      case "ready": {
        const row = result.data[0];
        return row === undefined
          ? { status: "ready", found: false, refetch }
          : { status: "ready", found: true, row, refetch };
      }
    }
  }, [absent, result]);
}
