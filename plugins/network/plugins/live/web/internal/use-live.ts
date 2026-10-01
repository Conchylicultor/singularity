import { useCallback, useMemo, useState } from "react";
import {
  useResource,
  type ResourceDescriptor,
  type ResourceError,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type {
  LiveCollection,
  LiveGroup,
  LiveGroupableColumn,
  LiveGroupQuery,
  LiveGroupValue,
  LiveQuery,
  LiveRowsCollection,
  LiveValue,
  LiveValueOrigin,
} from "@plugins/network/plugins/live/core";
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

/** What a window read adds to its ready arm. */
export interface LivePaging {
  /** The window is full and below `maxLimit` — `loadMore()` would add rows. */
  canGrow: boolean;
  /** A `loadMore()` is loading; the rows shown are the previous window's. */
  growing: boolean;
  /** Grow the window by one default page, clamped to `maxLimit`. */
  loadMore: () => void;
}

/**
 * A window read: `ResourceResult<Row[]>` whose ready arm carries the paging
 * handles. A grow that FAILS is the error arm, with the window it grew from as
 * `stale` — the rows the user was looking at, never a spinner.
 */
export type LiveListResult<Row> =
  | Extract<ResourceResult<Row[]>, { status: "loading" }>
  | Extract<ResourceResult<Row[]>, { status: "error" }>
  | (Extract<ResourceResult<Row[]>, { status: "ready" }> & LivePaging);

/** An explicit id set. Rows come back for the ids that exist; no filter applies. */
export interface LiveIdsQuery {
  ids: readonly string[];
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
export function useLive<T, P extends Record<string, string>>(
  value: LiveValue<T, P, LiveValueOrigin>,
  // `NoInfer`: `P` is the declaration's — a `{ path } | null` argument must not
  // narrow it past a declared optional param.
  ...params: LiveValueArgs<NoInfer<P>>
): ResourceResult<T>;
export function useLive<Row, F, S extends string>(
  source:
    | LiveCollection<Row, F, S>
    | LiveRowsCollection<Row>
    | LiveValue<unknown, Record<string, string>, LiveValueOrigin>,
  query?:
    | LiveQuery<F, S>
    | LiveGroupQuery<F>
    | LiveIdsQuery
    | Record<string, string>
    | null,
): LiveListResult<unknown> | ResourceResult<unknown> {
  // A declaration never changes kind between renders (it is a module-level
  // const), so the branch below keeps the hook order stable.
  if ("live" in source) {
    // `null` is the substrate's skip; `useResource` canonicalizes the params
    // (an absent optional one is one tuple however it is spelled).
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the declaration's kind is fixed for a call site: a module-level const never switches between a value and a collection
    return useResource(
      source,
      query as Record<string, string> | null | undefined,
    );
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see above: fixed per call site
  return useCollection(
    source,
    (query ?? undefined) as
      LiveQuery<F, S> | LiveGroupQuery<F> | LiveIdsQuery | undefined,
  );
}

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

/** The null-id answer: no id names no row, and there is nothing to refetch. */
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
 * mount): no id names no row.
 */
export function useLiveRow<Row>(
  collection: LiveRowsCollection<Row>,
  id: string | null,
): LiveRowResult<Row> {
  const idsKey = id === null ? null : collection.rows.point.encode([id]).ids;
  const params = useMemo(
    () => (idsKey === null ? null : { ids: idsKey }),
    [idsKey],
  );
  const result = useResource(collection.rows, params);
  const absent = id === null;
  // The result keeps its identity until what it is built from changes, like
  // `useLive`'s list result: consumers memoize on it. `useResource`'s own
  // result changes only with its status / data / error / stale.
  return useMemo((): LiveRowResult<Row> => {
    // Determinate without the server: no id names no row.
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
