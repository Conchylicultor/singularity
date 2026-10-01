import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  useResources,
  type ResourceDescriptor,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import {
  LIVE_ROW_KEY,
  type LiveQuery,
  type LiveScrollCollection,
  type LiveWindowParams,
} from "@plugins/network/plugins/live/core";
import { withoutWindowFields } from "./window-fields";
import {
  assemble,
  growTail,
  reconcile,
  segmentsOf,
  startScroll,
  TRUNCATION_DETAIL,
  type ScrollLimits,
  type ScrollState,
  type ScrollTruncation,
  type Segment,
  type SegmentObservation,
} from "../../shared/scroll-plan";

// `useLiveScroll` — a live, unbounded-looking scroll over a `scroll: true`
// collection, built from bounded windows: the SEGMENTS of `shared/scroll-plan`,
// each ≤ `maxLimit` and every one of them live. The plan decides the segments;
// this hook reads them (`useResources`: one window tuple per segment, kept
// subscribed by diff), feeds the plan what each settled on, and assembles the
// rows — split off from each row's `$key`, which the plan cuts at and a
// consumer never sees.

/** A scroll's query: the window query without `limit` — the scroll owns the limits. */
export type LiveScrollQuery<F, S extends string> = Omit<
  LiveQuery<F, S>,
  "limit"
>;

export interface LiveScrollOptions {
  /**
   * Which query changes keep the previous rows on screen until the new query's
   * first segment settles: a change whose `resetKey` equals the previous
   * one's is such a keep-previous handoff (a search typed into a list);
   * any other change starts over, loading. Absent: every change starts over.
   */
  resetKey?: string;
}

/** A read failing under rows that stay on screen. */
export interface LiveSegmentError {
  /** The failing read's identity — unique among the result's errors (a React key). */
  key: string;
  /** The last row before the failing segment; `null` = it is the head. */
  afterRowId: string | null;
  error: Error;
  /**
   * Paging is stopped on it — the tail's own read, a failed page past the
   * tail, or a failure that holds the scroll short of its end — so it belongs
   * where paging stopped (a list's footer), not above the rows.
   */
  blocksPaging: boolean;
  /** Re-read that segment (or its failed replacement). Never `loadMore`. */
  retry: () => void;
}

/**
 * A scroll read, in the states every read has: `loading` until the first
 * segment has rows, `error` when that first segment failed with nothing to
 * show (its `refetch` re-reads it), then `ready` — for good: a failure under
 * rows already shown is a `segmentErrors` entry, never the error arm.
 */
export type LiveScrollResult<Row> =
  | { status: "loading" }
  | { status: "error"; error: Error; refetch: () => Promise<void> }
  | {
      status: "ready";
      rows: readonly Row[];
      /** Every row of the query is loaded (nothing past the rendered prefix). */
      exhausted: boolean;
      /** `loadMore()` would add rows. */
      canGrow: boolean;
      /** A `loadMore()` is in flight; the rows shown are the previous ones. */
      growing: boolean;
      loadMore: () => void;
      /** The tail is full and cannot be paged past (the segment cap, or an over-long sort key). */
      truncated: false | { reason: ScrollTruncation };
      segmentErrors: readonly LiveSegmentError[];
    };

interface Plan {
  /** The collection and canonical query (no limit, no cuts) this plan's segments read. */
  base: string;
  query: LiveScrollQuery<unknown, string>;
  state: ScrollState;
}

interface HookState {
  /** The collection's key and the caller's `resetKey` (a new collection always starts over). */
  resetKey: string | null;
  current: Plan | null;
  /** The previous query's rows, kept while the current one's head loads (a keep-previous handoff). */
  previous: Plan | null;
  /** The last split that had to give up — reported once, from an effect. */
  collapse: { seq: number; reason: string; at: number } | null;
}

/**
 * Read a `scroll: true` collection as a live, segmented scroll. `query` is its
 * filter and order (`null` = nothing to read yet: loading, nothing read);
 * the scroll starts at one `default.limit` and pages through `loadMore()`.
 * Every loaded segment stays subscribed, so a row that stops matching leaves
 * and a new one enters wherever it falls, however deep it was scrolled.
 *
 * The result is `loading` (or `error`, when the first segment failed) until
 * the first segment settles; after that it is `ready` and never flips back — a grow, split or merge keeps the replaced segments
 * rendered until their replacements settle, and a replacement that fails
 * keeps its old rows with a `segmentErrors` entry to retry.
 */
export function useLiveScroll<Row, F, S extends string>(
  collection: LiveScrollCollection<Row, F, S> | null,
  query: LiveScrollQuery<F, S> | null,
  options: LiveScrollOptions = {},
): LiveScrollResult<Row> {
  if (collection === null && query !== null) {
    throw new Error(
      "useLiveScroll: a query with no collection — pass null for both to read nothing.",
    );
  }
  const codec = collection?.window.window ?? DETACHED.codec;
  const limits: ScrollLimits = useMemo(
    () => ({ step: codec.defaultLimit, maxLimit: codec.maxLimit }),
    [codec],
  );
  // The query's canonical key: the collection and the query's encoding at the
  // default limit, with no cut — two collections' queries may encode alike,
  // and a plan's cuts are one collection's row keys.
  const base =
    query === null
      ? null
      : JSON.stringify([collection!.key, codec.encode(query)]);
  const resetKey =
    collection === null
      ? null
      : JSON.stringify([collection.key, options.resetKey ?? base]);

  const [hook, setHook] = useState<HookState>(() => ({
    resetKey,
    current:
      query === null
        ? null
        : {
            base: base!,
            query: query as LiveScrollQuery<unknown, string>,
            state: startScroll(limits),
          },
    previous: null,
    collapse: null,
  }));

  // A new query: a fresh plan — keeping the previous rows on screen when only
  // what `resetKey` leaves out changed (adjusting state during render, the
  // React pattern for state derived from a changed prop).
  let state = hook;
  if ((state.current?.base ?? null) !== base) {
    const keep =
      state.current !== null && base !== null && state.resetKey === resetKey;
    // Back to the query still on screen (a search typed, then undone before
    // its head settled): that plan is current again, nothing restarts.
    const restored =
      keep && state.previous !== null && state.previous.base === base
        ? state.previous
        : null;
    state = {
      resetKey,
      current:
        restored ??
        (query === null
          ? null
          : {
              base: base!,
              query: query as LiveScrollQuery<unknown, string>,
              state: startScroll(limits),
            }),
      // Only the previous plan's committed rows stay: its change in flight
      // (or set aside), if any, is dropped with it.
      previous:
        keep && restored === null
          ? (state.previous ?? {
              ...state.current!,
              state: {
                committed: state.current!.state.committed,
                change: null,
                stalled: null,
              },
            })
          : null,
      collapse: state.collapse,
    };
  }
  // What this render reads: the plans as they stand before the reconcile
  // below (which may add segments the next render reads).
  const readState = state;

  // Every tuple either plan reads, one window per segment — each encoded once
  // per plan state (not per lookup), and each read once however many
  // segments name it.
  const { current: readCurrent, previous: readPrevious } = readState;
  const reads = useMemo(() => {
    const plans = [readCurrent, readPrevious].filter(
      (p): p is Plan => p !== null,
    );
    /** `segmentKey(plan, seg)` → its tuple's key. */
    const tupleKeyOf = new Map<string, string>();
    const tuples = new Map<string, LiveWindowParams>();
    for (const plan of plans) {
      for (const seg of segmentsOf(plan.state)) {
        const sk = segmentKey(plan, seg);
        if (tupleKeyOf.has(sk)) continue;
        const params = codec.encode(
          { ...(plan.query as LiveScrollQuery<F, S>), limit: seg.limit },
          {
            ...(seg.after !== null ? { after: seg.after } : {}),
            ...(seg.until !== null ? { until: seg.until } : {}),
          },
        );
        const tk = JSON.stringify(params);
        tupleKeyOf.set(sk, tk);
        tuples.set(tk, params);
      }
    }
    return {
      tupleKeyOf,
      keys: [...tuples.keys()],
      params: [...tuples.values()],
    };
  }, [readCurrent, readPrevious, codec]);
  const results = useResources(
    (collection?.window ??
      DETACHED.descriptor) as unknown as ResourceDescriptor<
      Row[],
      LiveWindowParams
    >,
    reads.params,
  );

  // Each tuple's result and what the plan observes of it, by tuple.
  const byTuple = useMemo(() => {
    const map = new Map<
      string,
      { result: ResourceResult<Row[]>; obs: SegmentObservation }
    >();
    reads.keys.forEach((tk, i) => {
      const result = results[i]!;
      const rows = rowsOfResult(result);
      const obs: SegmentObservation =
        rows === undefined
          ? result.status === "error"
            ? { kind: "failed", error: result.error }
            : { kind: "pending" }
          : {
              kind: "settled",
              entries: rows.map((row) => {
                const o = row as unknown as Record<string, unknown>;
                return {
                  id: String(o[collection!.id]),
                  key: (o[LIVE_ROW_KEY] as string | null | undefined) ?? null,
                };
              }),
              error: result.status === "error" ? result.error : null,
            };
      map.set(tk, { result, obs });
    });
    return map;
  }, [reads, results, collection]);
  const read = useCallback(
    (plan: Plan, seg: Segment) => {
      const tk = reads.tupleKeyOf.get(segmentKey(plan, seg));
      const hit = tk === undefined ? undefined : byTuple.get(tk);
      if (!hit || tk === undefined) {
        throw new Error(
          `useLiveScroll("${collection!.key}"): a segment was observed that is not read — the plan and the reads disagree.`,
        );
      }
      return { ...hit, tupleKey: tk };
    },
    [reads, byTuple, collection],
  );

  // Advance the plan (idempotent), and retire the previous rows once the
  // current head has an answer.
  if (state.current !== null) {
    const plan = state.current;
    const outcome = reconcile(plan.state, (seg) => read(plan, seg).obs, limits);
    if (outcome.state !== plan.state) {
      state = {
        ...state,
        current: { ...plan, state: outcome.state },
        ...(outcome.collapsed
          ? {
              collapse: {
                seq: (state.collapse?.seq ?? 0) + 1,
                ...outcome.collapsed,
              },
            }
          : {}),
      };
    }
    const head = read(plan, plan.state.committed[0]!).obs;
    if (state.previous !== null && head.kind !== "pending") {
      state = { ...state, previous: null };
    }
  }
  if (state !== hook) setHook(state);

  // A split that had to give up is reported loudly, once.
  const collapse = readState.collapse;
  useEffect(() => {
    if (collapse === null) return;
    clientLog(
      "live-scroll",
      `[${collection?.key ?? ""}] segment ${collapse.at} could not split (${collapse.reason}) — collapsed the scroll to it`,
    );
  }, [collapse, collection]);

  // Grows the plan this render read — a no-op if it moved on since.
  const loadMore = useCallback(() => {
    setHook((prev) => {
      if (prev.current === null || prev.current !== readCurrent) return prev;
      const plan = prev.current;
      const next = growTail(plan.state, (seg) => read(plan, seg).obs, limits);
      return next === plan.state
        ? prev
        : { ...prev, current: { ...plan, state: next } };
    });
  }, [readCurrent, read, limits]);

  const result = useMemo((): LiveScrollResult<Row> => {
    const plan = readCurrent;
    if (plan === null) return { status: "loading" };
    const shown =
      readPrevious !== null &&
      read(plan, plan.state.committed[0]!).obs.kind === "pending"
        ? readPrevious
        : plan;
    const observe = (seg: Segment) => read(shown, seg).obs;
    const a = assemble(shown.state, observe, limits);
    if (a.headError !== null) {
      const head = read(shown, shown.state.committed[0]!).result;
      return { status: "error", error: a.headError, refetch: head.refetch };
    }
    if (!a.loaded) return { status: "loading" };
    // Rows in segment order, deduped by id (first wins), `$key` split off.
    const seen = new Set<string>();
    const rows: Row[] = [];
    const firstRowOf: number[] = [];
    for (const seg of shown.state.committed) {
      firstRowOf.push(rows.length);
      const { result } = read(shown, seg);
      for (const row of rowsOfResult(result) ?? []) {
        const id = String(
          (row as unknown as Record<string, unknown>)[collection!.id],
        );
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push(withoutWindowFields(row));
      }
    }
    const segmentErrors: LiveSegmentError[] = a.failures.map((f) => {
      const before = firstRowOf[f.index]! - 1;
      const { result, tupleKey } = read(shown, f.failed);
      return {
        key: tupleKey,
        afterRowId:
          before < 0
            ? null
            : String(
                (rows[before] as unknown as Record<string, unknown>)[
                  collection!.id
                ],
              ),
        error: f.error,
        blocksPaging: f.blocksPaging,
        retry: () => void result.refetch(),
      };
    });
    const handoff = shown !== plan;
    return {
      status: "ready",
      rows,
      exhausted: !handoff && a.exhausted,
      canGrow: !handoff && a.canGrow,
      growing: !handoff && a.growing,
      loadMore,
      truncated:
        !handoff && a.truncated !== null ? { reason: a.truncated } : false,
      segmentErrors,
    };
  }, [readCurrent, readPrevious, read, limits, loadMore, collection]);

  // A tail that cannot be paged past, in the plan's own terms (the surface
  // tells the user in theirs), logged once each time the scroll reaches it.
  const truncatedAt =
    result.status === "ready" && result.truncated !== false
      ? result.truncated.reason
      : null;
  useEffect(() => {
    if (truncatedAt === null) return;
    clientLog(
      "live-scroll",
      `[${collection?.key ?? ""}] the scroll stops short: ${TRUNCATION_DETAIL[truncatedAt]}`,
    );
  }, [truncatedAt, collection]);
  return result;
}

/**
 * A tuple's rows: its value, or — failed — the last one it held; `undefined`
 * while it has none.
 */
function rowsOfResult<T>(result: ResourceResult<T[]>): T[] | undefined {
  switch (result.status) {
    case "loading":
      return undefined;
    case "error":
      return result.stale;
    case "ready":
      return result.data;
  }
}

/** A segment's identity within the plan reading it: its plan's query and its bounds. */
function segmentKey(plan: Plan, seg: Segment): string {
  return `${plan.base}\u0000${seg.after ?? ""}\u0000${seg.until ?? ""}\u0000${seg.limit}`;
}

/**
 * What a detached scroll (no collection, no query) stands on: nothing is ever
 * encoded or read through it — the hook's order just stays fixed.
 */
const DETACHED = {
  codec: {
    defaultLimit: 1,
    maxLimit: 3,
    encode: (..._args: unknown[]): LiveWindowParams => {
      throw new Error("useLiveScroll: a detached scroll encodes nothing");
    },
  },
  descriptor: {
    key: "network.live.scroll:detached",
    schema: z.array(z.never()),
  },
};
