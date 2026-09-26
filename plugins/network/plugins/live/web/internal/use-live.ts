import { useMemo, useState } from "react";
import {
  usePointResource,
  useResource,
  type ResourceDescriptor,
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

// The read half of a `liveCollection`. A consumer asks a QUERY — a window
// (`where` / `orderBy` / `limit`), a grouping (`groupBy`) or an explicit id set
// — and never picks the wire resource or its params: the window goes to `key`,
// a grouping to `:groups`, an id set to the `:rows` point sibling, and the
// encoding is the declaration's own codec. A grouping is a window over the
// grouped relation, so it shares the window's result and grow logic; only a
// read whose result has different STATES (`useLiveRow`) gets its own hook.
// A `liveValue` is read by the same hook: its result is `ResourceResult<T>`,
// the states every read already has, so it gets no hook of its own.

/** What a window read adds to its settled arm. */
export interface LivePaging {
  /** The window is full and below `maxLimit` — `loadMore()` would add rows. */
  canGrow: boolean;
  /** A `loadMore()` is loading; the rows shown are the previous window's. */
  growing: boolean;
  /** Grow the window by one default page, clamped to `maxLimit`. */
  loadMore: () => void;
}

/** A window read: `ResourceResult<Row[]>` whose settled arm carries the paging handles. */
export type LiveListResult<Row> =
  | Extract<ResourceResult<Row[]>, { pending: true }>
  | (Extract<ResourceResult<Row[]>, { pending: false }> & LivePaging);

/** An explicit id set. Rows come back for the ids that exist; no filter applies. */
export interface LiveIdsQuery {
  ids: readonly string[];
}

/** One row by id: loading, found, or determinately absent. */
export type LiveRowResult<Row> =
  | { pending: true; error: Error | null; stale?: Row }
  | { pending: false; found: true; row: Row }
  | { pending: false; found: false };

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
  const { where, orderBy } = (query ?? {}) as LiveQuery<F, S>;
  return {
    descriptor: collection.window as AnyDescriptor,
    base: JSON.stringify(["window", codec.encode({ where, orderBy })]),
    encode: (limit) => codec.encode({ where, orderBy, limit }),
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
 * `Record<string, never>` — no declared name), required (the declared names,
 * each a string) otherwise.
 */
type LiveValueArgs<P> = string extends keyof P
  ? []
  : [keyof P] extends [never]
    ? []
    : [params: P];

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
 */
export function useLive<T, P extends Record<string, string>>(
  value: LiveValue<T, P, LiveValueOrigin>,
  ...params: LiveValueArgs<P>
): ResourceResult<T>;
export function useLive<Row, F, S extends string>(
  source:
    | LiveCollection<Row, F, S>
    | LiveRowsCollection<Row>
    | LiveValue<unknown, Record<string, string>, LiveValueOrigin>,
  query?:
    LiveQuery<F, S> | LiveGroupQuery<F> | LiveIdsQuery | Record<string, string>,
): LiveListResult<unknown> | ResourceResult<unknown> {
  // A declaration never changes kind between renders (it is a module-level
  // const), so the branch below keeps the hook order stable.
  if ("live" in source) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the declaration's kind is fixed for a call site: a module-level const never switches between a value and a collection
    return useResource(source, query as Record<string, string> | undefined);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see above: fixed per call site
  return useCollection(
    source,
    query as LiveQuery<F, S> | LiveGroupQuery<F> | LiveIdsQuery | undefined,
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

  // The list a grow started from, kept subscribed ONLY while the grown one is
  // loading (then this collapses onto `params`, a shared refcount, and the old
  // tuple is released).
  const growing = grow !== null && current.pending && current.error === null;
  const prevParams = useMemo(
    () => (growing ? (JSON.parse(prevKey) as Record<string, string>) : params),
    [growing, prevKey, params],
  );
  const previous = useResource(descriptor, prevParams);

  if (shape === null) return current as ResourceResult<Row[]>;

  const loadMore = () => {
    const next = Math.min(limit + shape.step, shape.maxLimit);
    if (next === limit) return;
    setGrown({ base: shape.base, from: limit, limit: next });
  };

  if (growing && !previous.pending) {
    return {
      pending: false,
      data: previous.data as unknown[],
      refetch: previous.refetch,
      canGrow: false,
      growing: true,
      loadMore,
    };
  }
  if (current.pending) return current as LiveListResult<unknown>;
  const data = current.data as unknown[];
  return {
    ...current,
    data,
    canGrow: data.length === limit && limit < shape.maxLimit,
    growing: false,
    loadMore,
  };
}

/**
 * Read one row of a live collection by id: `pending`, then `found: true` with
 * the row or `found: false` when the server answered and no such row exists —
 * a determinate answer, never a spinner. Reads the `:rows` point sibling, so it
 * ignores every window filter and bound: it answers "does this row exist".
 */
export function useLiveRow<Row>(
  collection: LiveRowsCollection<Row>,
  id: string,
): LiveRowResult<Row> {
  const result = usePointResource(collection.rows, id);
  if (result.pending) {
    return result.stale != null
      ? { pending: true, error: result.error, stale: result.stale }
      : { pending: true, error: result.error };
  }
  return result.data === null
    ? { pending: false, found: false }
    : { pending: false, found: true, row: result.data };
}
