import { useMemo, useState } from "react";
import {
  usePointResource,
  useResource,
  type ResourceDescriptor,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type {
  LiveCollection,
  LiveQuery,
} from "@plugins/network/plugins/live/core";

// The read half of a `liveCollection`. A consumer asks a QUERY — a window
// (`where` / `orderBy` / `limit`) or an explicit id set — and never picks the
// wire resource or its params: the window goes to `key`, an id set to the
// `:rows` point sibling, and the encoding is the declaration's own codec.

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

type AnyDescriptor<Row> = ResourceDescriptor<Row[], Record<string, string>>;

/**
 * Read a live collection.
 *
 * - `useLive(c)` / `useLive(c, { where, orderBy, limit })` — a bounded window.
 *   Its settled arm adds `canGrow` / `growing` / `loadMore()`; while a grown
 *   window loads, the hook STAYS settled on the previous rows (`growing: true`)
 *   — those rows are server-vouched and still subscribed — so `if (pending)`
 *   never flashes a spinner over a list that already rendered.
 * - `useLive(c, { ids })` — an explicit id set, via the `:rows` point sibling.
 *   No paging fields: an id set is not a window.
 */
export function useLive<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S>,
  query: LiveIdsQuery,
): ResourceResult<Row[]>;
export function useLive<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S>,
  query?: LiveQuery<F, S>,
): LiveListResult<Row>;
export function useLive<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S>,
  query?: LiveQuery<F, S> | LiveIdsQuery,
): LiveListResult<Row> | ResourceResult<Row[]> {
  const codec = collection.window.window;
  const ids = query && "ids" in query ? query.ids : undefined;
  const windowQuery = query && !("ids" in query) ? query : undefined;

  // The query WITHOUT its limit identifies which window a grow belongs to; a
  // grow is forgotten (back to the asked limit) as soon as the query changes.
  // Encoded through the codec, so two spellings of one query are one identity.
  const where = windowQuery?.where;
  const orderBy = windowQuery?.orderBy;
  const baseKey = JSON.stringify(
    ids === undefined ? codec.encode({ where, orderBy }) : null,
  );
  const askedLimit = windowQuery?.limit ?? codec.defaultLimit;
  const [grown, setGrown] = useState<{
    base: string;
    from: number;
    limit: number;
  } | null>(null);
  const grow = grown?.base === baseKey ? grown : null;
  const limit = grow?.limit ?? askedLimit;

  const idsKey =
    ids === undefined ? null : collection.rows.point.encode(ids).ids;
  const paramsKey = JSON.stringify(
    idsKey !== null ? { ids: idsKey } : codec.encode({ where, orderBy, limit }),
  );
  const prevKey = JSON.stringify(
    grow ? codec.encode({ where, orderBy, limit: grow.from }) : null,
  );
  const params = useMemo(
    () => JSON.parse(paramsKey) as Record<string, string>,
    [paramsKey],
  );

  const descriptor: AnyDescriptor<Row> =
    idsKey !== null ? collection.rows : collection.window;
  const current = useResource(descriptor, params);

  // The window a grow started from, kept subscribed ONLY while the grown one is
  // loading (then this collapses onto `params`, a shared refcount, and the old
  // tuple is released).
  const growing = grow !== null && current.pending && current.error === null;
  const prevParams = useMemo(
    () => (growing ? (JSON.parse(prevKey) as Record<string, string>) : params),
    [growing, prevKey, params],
  );
  const previous = useResource(descriptor, prevParams);

  if (idsKey !== null) return current;

  const loadMore = () => {
    const next = Math.min(limit + codec.defaultLimit, codec.maxLimit);
    if (next === limit) return;
    setGrown({ base: baseKey, from: limit, limit: next });
  };

  if (growing && !previous.pending) {
    return {
      pending: false,
      data: previous.data,
      refetch: previous.refetch,
      canGrow: false,
      growing: true,
      loadMore,
    };
  }
  if (current.pending) return current;
  return {
    ...current,
    canGrow: current.data.length === limit && limit < codec.maxLimit,
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
export function useLiveRow<Row, F, S extends string>(
  collection: LiveCollection<Row, F, S>,
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
