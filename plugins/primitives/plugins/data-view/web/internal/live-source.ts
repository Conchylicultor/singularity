import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeferredLoadState } from "@plugins/framework/plugins/web-sdk/core";
import {
  and,
  canonicalizeFilter,
  filterColumns,
  FilterError,
  type Filter,
  type Filterable,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type {
  LiveColumnsDeclaration,
  LiveOrderBy,
  LiveSortDirection,
  LiveWhere,
} from "@plugins/network/plugins/live/core";
import {
  useLiveScroll,
  type LiveSegmentError,
  type ScrollTruncation,
} from "@plugins/network/plugins/live/web";
import {
  useInfiniteScroll,
  type InfiniteScrollHandle,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import type {
  FieldDef,
  FieldGrouping,
  LiveDataSource,
  ViewState,
} from "../../core";
import {
  renameColumns,
  type LiveFieldPlan,
  type ResolveOperatorSet,
} from "./live-fields";
import {
  lowerSearch,
  UnavailableFilterRuleError,
  UnavailableSortRuleError,
  useServerFilter,
} from "./server-filter";

// The DataView → live-window adapter (research/2026-09-29-global-scoped-change-routing.md,
// "P2 — DataView live-window adapter"): a `source` DataView reads its collection
// as a segmented scroll (`useLiveScroll`), with the view's sort, filter, search
// and group-by lowered onto the window query. Field ids stay the persisted
// vocabulary; `FieldDef.column` maps one to the collection column it reads.

/** The search box, debounced: each keystroke would otherwise mint, load and release a tuple. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** A read failing under rows that stay on screen, above them (not one paging stopped on — that is the footer's). */
export interface LiveSegmentNotice {
  /** Unique among the notices (the failing read's identity). */
  key: string;
  afterRowId: string | null;
  error: Error;
  retry: () => void;
}

/** A data origin's answer, as the body renders it (fetchPage and live alike). */
export interface SourceView<TRow> {
  rows: readonly TRow[];
  loading: boolean;
  /** Why no rows can be shown — rendered in place of the view. */
  error: Error | null;
  scroll: InfiniteScrollHandle;
  /** Every row of the query is loaded — section counts may be exact. */
  rowsComplete: boolean;
  sectionOrder: "bucket" | "appearance";
  /** The tail cannot be paged past (the footer says so). */
  truncated: false | { reason: ScrollTruncation };
  notices: readonly LiveSegmentNotice[];
}

const SEARCH_DEBOUNCE_MS = 200;
const NO_NOTICES: readonly LiveSegmentNotice[] = [];
const NO_ERRORS: readonly LiveSegmentError[] = [];

/**
 * Read a live `source` for the active view: lower its sort, filter, search and
 * group-by onto a segmented scroll, and map the scroll onto the body's
 * `SourceView`. Always called; returns `null` without a source (the hook order
 * stays fixed).
 *
 * - A saved rule on a field that does not resolve is PENDING while the
 *   deferred plugin tier is still loading (a contributor may not have
 *   registered its field yet), and the error arm once it settled.
 * - A search-only change keeps the previous rows until the new head settles;
 *   any other change (sort, filter, group, the midnight clock) starts over.
 * - A one-bucket-per-value grouping over a sortable column is prepended to the
 *   order, and its sections follow row order.
 */
export function useLiveSource<TRow>(args: {
  source: LiveDataSource<TRow> | undefined;
  plan: LiveFieldPlan<TRow> | null;
  fields: readonly FieldDef<TRow>[];
  state: ViewState;
  resolveOperatorSet: ResolveOperatorSet;
  resolveGrouping: (typeId: string, groupingId: string) => FieldGrouping;
  holdPaging: (rows: readonly TRow[]) => boolean;
}): SourceView<TRow> | null {
  const { source, plan, fields, state, resolveOperatorSet, resolveGrouping } =
    args;
  const { deferredComplete } = useDeferredLoadState();
  const query = useDebounced(state.query, SEARCH_DEBOUNCE_MS);

  // The view's filter, lowered over FIELD ids (relative dates against the day
  // clock), before its rename onto columns.
  const lowered = useServerFilter({
    group: plan ? state.filter : null,
    query: "",
    fields: plan?.filterFields ?? NO_FIELDS,
    resolveOperatorSet,
    filterable: plan?.filterable ?? NO_FILTERABLE,
    searchable: NO_SEARCHABLE,
  });

  const lowering = useMemo(():
    | { kind: "none" }
    | { kind: "pending" }
    | { kind: "error"; error: Error }
    | {
        kind: "ok";
        where: Filter | undefined;
        /** The query minus search — a change of it starts the scroll over. */
        resetKey: string;
        orderBy: LiveOrderBy<string> | undefined;
        /** The contributed-column handles the query names — the codec validates against them. */
        columns: readonly LiveColumnsDeclaration[];
        sectionOrder: "bucket" | "appearance";
      } => {
    if (!source || !plan) return { kind: "none" };
    // The scope's value is not known yet: read nothing, show the loading state.
    if (source.scope.kind === "awaiting") return { kind: "pending" };
    const collection = source.collection;
    // The collection's own filterable columns, and every contributed one the
    // offered fields bind to (by wire name).
    const declared: Filterable = {
      ...(collection.filterable as unknown as Filterable),
      ...Object.assign(
        {},
        ...[...plan.handles.values()].map((h) => h.wireFilterable),
      ),
    };
    const unavailable = (error: Error) =>
      deferredComplete
        ? { kind: "error" as const, error }
        : { kind: "pending" as const };

    // Sort: each rule's column; a rule on no sortable column is unavailable.
    const sortable = new Set(plan.sortFields.map((f) => f.id));
    const missing = state.sort
      .filter((r) => !sortable.has(r.fieldId))
      .map((r) => r.fieldId);
    if (missing.length > 0) {
      return unavailable(new UnavailableSortRuleError(missing));
    }
    if (lowered.kind === "error") {
      return lowered.error instanceof UnavailableFilterRuleError
        ? unavailable(lowered.error)
        : { kind: "error", error: lowered.error };
    }
    const columnOf = (fieldId: string) => plan.columnOf.get(fieldId)!;
    let order: [string, LiveSortDirection][] =
      state.sort.length > 0
        ? state.sort.map((r) => [columnOf(r.fieldId), r.direction])
        : collection.window.window.defaultOrderBy.map(
            ([c, d]) => [c, d] as [string, LiveSortDirection],
          );
    // Group-by: a one-bucket-per-value grouping over a sortable column leads
    // the order, so its sections are contiguous in row order.
    let sectionOrder: "bucket" | "appearance" = "bucket";
    const groupField = state.groupBy
      ? fields.find((f) => f.id === state.groupBy!.fieldId)
      : undefined;
    if (state.groupBy && groupField && sortable.has(groupField.id)) {
      const grouping = resolveGrouping(
        groupField.type ?? "text",
        state.groupBy.groupingId,
      );
      if (grouping.oneBucketPerValue === true) {
        const col = columnOf(groupField.id);
        const dir =
          state.sort.find((r) => r.fieldId === groupField.id)?.direction ??
          "asc";
        if (order[0]?.[0] !== col) order = [[col, dir], ...order];
        sectionOrder = "appearance";
      }
    }
    // A column named twice (the prepend, or two fields on one column): the
    // codec refuses a duplicate, and the second can never reorder anything.
    const seen = new Set<string>();
    order = order.filter(([c]) => !seen.has(c) && seen.add(c) !== undefined);

    const renamed =
      lowered.filter === undefined
        ? undefined
        : renameColumns(lowered.filter, columnOf);
    const search = lowerSearch(query, source.searchable, declared);
    const scope =
      source.scope.kind === "where" ? source.scope.filter : undefined;
    const base = [scope, renamed].filter((f): f is Filter => f !== undefined);
    const parts = search === undefined ? base : [...base, search];
    let where: Filter | undefined;
    try {
      where =
        parts.length === 0
          ? undefined
          : canonicalizeFilter(and(...parts), declared);
      // The reset key's filter, without the search: canonicalized the same way.
      const resetWhere =
        base.length === 0
          ? undefined
          : canonicalizeFilter(and(...base), declared);
      // The contributors whose columns the query names (by wire name).
      const named = new Set([
        ...(where === undefined ? [] : filterColumns(where)),
        ...order.map(([c]) => c),
      ]);
      const columns = [...plan.handles.values()].filter((h) =>
        [...named].some((c) => c.startsWith(`${h.name}.`)),
      );
      return {
        kind: "ok",
        where,
        orderBy: order,
        columns,
        sectionOrder,
        resetKey: JSON.stringify({ where: resetWhere ?? null, order }),
      };
    } catch (err) {
      if (!(err instanceof FilterError)) throw err;
      return { kind: "error", error: err };
    }
  }, [
    source,
    plan,
    fields,
    state.sort,
    state.groupBy,
    lowered,
    query,
    deferredComplete,
    resolveGrouping,
  ]);

  const scrollQuery = useMemo(
    () =>
      lowering.kind === "ok"
        ? {
            ...(lowering.where !== undefined
              ? { where: lowering.where as LiveWhere<unknown> }
              : {}),
            ...(lowering.orderBy !== undefined
              ? { orderBy: lowering.orderBy }
              : {}),
            ...(lowering.columns.length > 0
              ? { columns: lowering.columns }
              : {}),
          }
        : null,
    [lowering],
  );
  const scroll = useLiveScroll(
    // No source: a detached scroll, which reads nothing.
    source?.collection ?? null,
    scrollQuery,
    lowering.kind === "ok" ? { resetKey: lowering.resetKey } : {},
  );

  const settled =
    scroll.status === "loading" || scroll.status === "error" ? null : scroll;
  const rows = (settled?.rows ?? NO_ROWS) as readonly TRow[];
  // The failures paging stopped on are the footer's "couldn't load more",
  // whose Retry re-reads each of them; the rest are notices above the rows.
  const blocking: readonly LiveSegmentError[] = useMemo(
    () => settled?.segmentErrors.filter((e) => e.blocksPaging) ?? NO_ERRORS,
    [settled],
  );
  const retryBlocking = useCallback(() => {
    for (const e of blocking) e.retry();
  }, [blocking]);
  const held = args.holdPaging(rows);
  const handle = useInfiniteScroll({
    hasNextPage: (settled?.canGrow ?? false) && !held,
    isFetchingNextPage: settled?.growing ?? false,
    isFetchNextPageError: blocking.length > 0,
    fetchNextPage: settled?.loadMore ?? NOOP,
    ...(blocking.length > 0 ? { retry: retryBlocking } : {}),
  });
  const notices = useMemo(
    () =>
      settled === null
        ? NO_NOTICES
        : settled.segmentErrors
            .filter((e) => !e.blocksPaging)
            .map((e) => ({
              key: e.key,
              afterRowId: e.afterRowId,
              error: e.error,
              retry: e.retry,
            })),
    [settled],
  );

  if (!source) return null;
  if (lowering.kind === "error") {
    return {
      rows: NO_ROWS as readonly TRow[],
      loading: false,
      error: lowering.error,
      scroll: handle,
      rowsComplete: false,
      sectionOrder: "bucket",
      truncated: false,
      notices: NO_NOTICES,
    };
  }
  return {
    rows,
    loading: lowering.kind !== "ok" || scroll.status === "loading",
    error: scroll.status === "error" ? scroll.error : null,
    scroll: handle,
    rowsComplete: settled?.exhausted ?? false,
    sectionOrder: lowering.kind === "ok" ? lowering.sectionOrder : "bucket",
    truncated: settled?.truncated ?? false,
    notices,
  };
}

const NO_FIELDS: FieldDef<never>[] = [];
const NO_FILTERABLE: Filterable = {};
const NO_SEARCHABLE: readonly string[] = [];
const NO_ROWS: readonly unknown[] = [];
const NOOP = () => {};
