import { useCallback, useMemo, useState } from "react";
import {
  useResources,
  type PagedResourceResult,
  type ResourceDescriptor,
  type ResourceError,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type {
  LivePage,
  LivePagedValue,
  LivePageParams,
  LiveValueOrigin,
} from "@plugins/network/plugins/live/core";
import {
  assembleChain,
  chainSpecs,
  growChain,
  reconcileChain,
  startChain,
  type PageChainState,
  type PageObservation,
  type PageSpec,
} from "../../shared/page-chain";

// The read half of a cursor-paged value (`liveValue(key, { query, paged })`):
// the chain of `shared/page-chain` — page k+1 asked with page k's
// `nextCursor`, every loaded page its own live tuple — read through
// live-state's `useResources` (subscribed by diff, so a page kept across a
// change is never re-subscribed). The plan decides the pages; this hook reads
// them, feeds the plan what each settled on, and hands out the items.

export interface LivePagesOptions {
  /**
   * The first page's size (a preview), at most the declaration's
   * `paged.limit`; later pages are `paged.limit`. Default `paged.limit`.
   */
  first?: number;
}

/**
 * A paged value's read: live-state's `PagedResourceResult<Item>` — loading,
 * error (with every item still held as `stale`), or ready with `canGrow` /
 * `growing` / `loadMore` — plus the first page's `meta` (on the error arm
 * when it is known) and `truncated`: the chain holds `MAX_LIVE_PAGES` and
 * will not ask the next one.
 */
export type LivePagesResult<Item, Meta> =
  | Extract<PagedResourceResult<Item>, { status: "loading" }>
  | (Extract<PagedResourceResult<Item>, { status: "error" }> & {
      meta?: Meta;
    })
  | (Extract<PagedResourceResult<Item>, { status: "ready" }> & {
      meta: Meta;
      truncated: boolean;
    });

interface HookState {
  /** The question and first-page size the chain is for; `null` = nothing read. */
  base: string | null;
  chain: PageChainState | null;
}

const NO_REFETCH = () => Promise.resolve();

/**
 * Read a paged value as a live chain of pages. `query` is the question
 * (`null` = nothing to read yet: loading, nothing read); the chain starts at
 * one page of `first` items and grows by one `paged.limit` page per
 * `loadMore()`. A changed question (or `first`) starts over, loading.
 */
export function useLivePages<Item, Meta, Q, QIn>(
  value: LivePagedValue<Item, Meta, Q, QIn, LiveValueOrigin>,
  query: QIn | null,
  options: LivePagesOptions = {},
): LivePagesResult<Item, Meta> {
  const { limit, id } = value.paged;
  const first = options.first ?? limit;
  if (!Number.isInteger(first) || first < 1 || first > limit) {
    throw new Error(
      `useLive("${value.key}"): first ${first} is not an integer in 1..${limit} (paged.limit).`,
    );
  }
  const q = query === null ? null : value.query.encodeQuery(query);
  const base = q === null ? null : JSON.stringify([q, first]);

  const [hook, setHook] = useState<HookState>(() => ({
    base,
    chain: base === null ? null : startChain(first),
  }));
  // A new question: a fresh chain (adjusting state during render, the React
  // pattern for state derived from a changed prop).
  let state = hook;
  if (state.base !== base) {
    state = { base, chain: base === null ? null : startChain(first) };
  }
  const readChain = state.chain;

  const reads = useMemo(() => {
    const byKey = new Map<string, LivePageParams>();
    if (q !== null && readChain !== null) {
      for (const spec of chainSpecs(readChain)) {
        byKey.set(specKey(spec), value.query.page(q, spec));
      }
    }
    return { keys: [...byKey.keys()], params: [...byKey.values()] };
  }, [q, readChain, value]);
  const results = useResources(
    value as unknown as ResourceDescriptor<
      LivePage<Item, Meta>,
      LivePageParams
    >,
    reads.params,
  );

  const byKey = useMemo(() => {
    const map = new Map<
      string,
      {
        result: ResourceResult<LivePage<Item, Meta>>;
        obs: PageObservation<Item, Meta, ResourceError>;
      }
    >();
    reads.keys.forEach((k, i) => {
      const result = results[i]!;
      map.set(k, { result, obs: observation(result) });
    });
    return map;
  }, [reads, results]);
  const read = useCallback(
    (spec: PageSpec) => {
      const hit = byKey.get(specKey(spec));
      if (hit === undefined) {
        throw new Error(
          `useLive("${value.key}"): a page was observed that is not read — the chain and the reads disagree.`,
        );
      }
      return hit;
    },
    [byKey, value],
  );
  const observe = useCallback((spec: PageSpec) => read(spec).obs, [read]);

  // Advance the chain (idempotent): re-mint a page whose predecessor's
  // boundary moved, release a page its replacement settled over.
  if (state.chain !== null) {
    const next = reconcileChain(state.chain, observe, limit);
    if (next !== state.chain) state = { ...state, chain: next };
  }
  if (state !== hook) setHook(state);

  // Grows the chain this render read — a no-op if it moved on since.
  const loadMore = useCallback(() => {
    setHook((prev) => {
      if (prev.chain === null || prev.chain !== readChain) return prev;
      const next = growChain(prev.chain, observe, limit);
      return next === prev.chain ? prev : { ...prev, chain: next };
    });
  }, [readChain, observe, limit]);

  return useMemo((): LivePagesResult<Item, Meta> => {
    if (readChain === null) return { status: "loading", refetch: NO_REFETCH };
    const idOf = (item: Item) =>
      String((item as unknown as Record<string, unknown>)[id]);
    const a = assembleChain(readChain, observe, idOf);
    const refetchAll = () =>
      Promise.all(
        readChain.slots.map((slot) => read(slot.spec).result.refetch()),
      ).then(() => undefined);
    switch (a.kind) {
      case "loading":
        return {
          status: "loading",
          refetch: read(readChain.slots[0]!.spec).result.refetch,
        };
      case "error":
        return {
          status: "error",
          error: a.error,
          ...(a.stale !== undefined ? { stale: a.stale } : {}),
          ...(a.meta !== undefined ? { meta: a.meta } : {}),
          refetch: read(a.failing).result.refetch,
        };
      case "ready":
        return {
          status: "ready",
          data: a.items,
          // `meta` is typed by the declaration: absent exactly when it
          // declares none (`Meta` is `undefined` then).
          meta: a.meta as Meta,
          canGrow: a.canGrow,
          growing: a.growing,
          truncated: a.truncated,
          loadMore,
          refetch: refetchAll,
        };
    }
  }, [readChain, observe, read, id, loadMore]);
}

/** A page's identity within the chain's reads. */
function specKey(spec: PageSpec): string {
  return `${spec.limit}\u0000${spec.cursor ?? ""}`;
}

/** What the chain observes of one page tuple's read. */
function observation<Item, Meta>(
  result: ResourceResult<LivePage<Item, Meta>>,
): PageObservation<Item, Meta, ResourceError> {
  switch (result.status) {
    case "loading":
      return { kind: "pending" };
    case "error":
      return result.stale === undefined
        ? { kind: "failed", error: result.error }
        : { kind: "settled", page: result.stale, error: result.error };
    case "ready":
      return { kind: "settled", page: result.data, error: null };
  }
}
