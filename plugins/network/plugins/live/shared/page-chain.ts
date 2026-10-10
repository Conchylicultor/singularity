// The page chain of a cursor-paged value, as pure data — `useLive(paged, query,
// { first })` (`web/internal/use-live-pages.ts`) feeds it what each page's read
// settled on and renders what it assembles. The twin of `scroll-plan.ts` for a
// value paged by a SERVER cursor: there are no cuts to split or merge at, only
// a chain — page k+1 is asked with page k's `nextCursor` — and every loaded
// page stays live (each is its own tuple, invalidated and refetched on its own).
// See `plugins/network/plugins/live/CLAUDE.md` (*Paged values*) and
// research/2026-10-09-global-live-structured-paged-values.md §2.
//
// The one invariant: the chain's pages are consecutive — each page's cursor is
// the `nextCursor` its predecessor answers. A refresh that moves a boundary
// (page k now answers a different `nextCursor`) RE-MINTS page k+1 from it; the
// page it replaces stays read and rendered until the replacement settles, so
// the chain never flips back to loading (the scroll plan's handoff rule).

/** One page tuple of the chain: the cursor it is asked with and its size. */
export interface PageSpec {
  /** The predecessor's `nextCursor`; `null` = the first page. */
  cursor: string | null;
  limit: number;
}

/** One position in the chain: the page read now, and the one it replaced while that settles. */
export interface PageSlot {
  spec: PageSpec;
  /**
   * The page this slot read before a boundary moved, kept read and rendered
   * until `spec` settles cleanly — `null` when nothing is being replaced.
   */
  previous: PageSpec | null;
}

export interface PageChainState {
  /** Never empty: slot 0 is the first page. */
  slots: readonly PageSlot[];
}

/** What one page as the planner reads it carries: its items, the next cursor and the per-query meta. */
export interface PageData<Item, Meta> {
  items: readonly Item[];
  nextCursor: string | null;
  meta?: Meta;
}

/**
 * What one page tuple's read says right now. `E` is the reader's error type —
 * carried, never inspected, so a live read's `ResourceError` reaches what the
 * plan assembles unwidened.
 */
export type PageObservation<Item, Meta, E extends Error = Error> =
  /** No value has landed yet. */
  | { kind: "pending" }
  /** A value the server vouched for — current, or (with `error`) the last one before its read failed. */
  | { kind: "settled"; page: PageData<Item, Meta>; error: E | null }
  /** The first read failed: nothing to show. */
  | { kind: "failed"; error: E };

/** A chain holds at most this many pages; past it, `loadMore` stops and the result says `truncated`. */
export const MAX_LIVE_PAGES = 32;

/** A new chain: the first page, at `first` items. */
export function startChain(first: number): PageChainState {
  return { slots: [{ spec: { cursor: null, limit: first }, previous: null }] };
}

/** Every page tuple the chain reads now: each slot's page, and the page it is replacing. */
export function chainSpecs(state: PageChainState): PageSpec[] {
  return state.slots.flatMap((s) =>
    s.previous === null ? [s.spec] : [s.spec, s.previous],
  );
}

const sameSpec = (a: PageSpec, b: PageSpec): boolean =>
  a.cursor === b.cursor && a.limit === b.limit;

/** A page whose current read the server vouches for, with no failure. */
function clean<Item, Meta, E extends Error>(
  o: PageObservation<Item, Meta, E>,
): o is { kind: "settled"; page: PageData<Item, Meta>; error: null } {
  return o.kind === "settled" && o.error === null;
}

/**
 * Advance the chain against what its pages observe. Pure and idempotent: fed
 * its own output with the same observations, it returns that output unchanged
 * (the same object) — so a caller may run it on every render.
 *
 * - A slot whose page settled cleanly releases the page it replaced.
 * - Walking the chain from page 1: a page whose predecessor settled cleanly
 *   must be asked with the predecessor's `nextCursor`. If that moved, the page
 *   is RE-MINTED from it (the page it replaces stays read until the new one
 *   settles — the oldest one on screen, if a replacement was already in
 *   flight); if the predecessor now ends the chain (`nextCursor: null`), every
 *   page from here on is dropped. A predecessor not cleanly settled (loading,
 *   refetch failed, itself being replaced) holds the walk: what follows it is
 *   left alone until it answers.
 */
export function reconcileChain<Item, Meta, E extends Error>(
  state: PageChainState,
  observe: (spec: PageSpec) => PageObservation<Item, Meta, E>,
  limit: number,
): PageChainState {
  let changed = false;
  const slots: PageSlot[] = state.slots.map((slot) => {
    if (slot.previous !== null && clean(observe(slot.spec))) {
      changed = true;
      return { spec: slot.spec, previous: null };
    }
    return slot;
  });
  for (let k = 1; k < slots.length; k++) {
    const before = slots[k - 1]!;
    if (before.previous !== null) break;
    const o = observe(before.spec);
    if (!clean(o)) break;
    const expected = o.page.nextCursor;
    if (expected === null) {
      slots.length = k;
      changed = true;
      break;
    }
    const slot = slots[k]!;
    if (slot.spec.cursor === expected) continue;
    const next: PageSpec = { cursor: expected, limit };
    // Keep the oldest page on screen: the current one if it has something to
    // show, else the one it was already replacing.
    const shown =
      observe(slot.spec).kind === "settled" || slot.previous === null
        ? slot.spec
        : slot.previous;
    slots[k] = {
      spec: next,
      previous: sameSpec(shown, next) ? null : shown,
    };
    changed = true;
  }
  return changed ? { slots } : state;
}

/**
 * Grow the chain by one page — the tail's `nextCursor`, at `limit` — when the
 * tail settled cleanly, has a next page, and the chain is under
 * `MAX_LIVE_PAGES`. Anything else returns `state` itself (a no-op).
 */
export function growChain<Item, Meta, E extends Error>(
  state: PageChainState,
  observe: (spec: PageSpec) => PageObservation<Item, Meta, E>,
  limit: number,
): PageChainState {
  const tail = state.slots[state.slots.length - 1]!;
  if (tail.previous !== null || state.slots.length >= MAX_LIVE_PAGES) {
    return state;
  }
  const o = observe(tail.spec);
  if (!clean(o) || o.page.nextCursor === null) return state;
  return {
    slots: [
      ...state.slots,
      { spec: { cursor: o.page.nextCursor, limit }, previous: null },
    ],
  };
}

/** What the chain renders now. */
export type AssembledChain<Item, Meta, E extends Error> =
  /** The first page has nothing to show yet. */
  | { kind: "loading" }
  /**
   * A page's read is failing: the error, and every item the chain still holds
   * (`stale` — absent when the first page has never answered).
   */
  | {
      kind: "error";
      error: E;
      /** The failing page — what a retry re-reads. */
      failing: PageSpec;
      stale?: Item[];
      meta?: Meta;
    }
  | {
      kind: "ready";
      items: Item[];
      /** The first page's meta. */
      meta: Meta | undefined;
      /** `growChain` would add a page. */
      canGrow: boolean;
      /** A page asked by a grow is loading; the items shown are the ones before it. */
      growing: boolean;
      /** The tail has a next page the chain will not ask — it holds `MAX_LIVE_PAGES`. */
      truncated: boolean;
    };

/**
 * The items the chain shows, page by page — a slot whose page has not
 * answered yet shows the page it replaces — deduped by `idOf`, the first
 * occurrence kept (data that shifted across a boundary appears on both
 * pages until the later one refreshes).
 */
export function assembleChain<Item, Meta, E extends Error>(
  state: PageChainState,
  observe: (spec: PageSpec) => PageObservation<Item, Meta, E>,
  idOf: (item: Item) => string,
): AssembledChain<Item, Meta, E> {
  const seen = new Set<string>();
  const items: Item[] = [];
  let meta: Meta | undefined;
  let failure: { error: E; failing: PageSpec } | null = null;
  let growing = false;
  let tailPage: PageData<Item, Meta> | null = null;
  let tailClean = true;
  for (const [k, slot] of state.slots.entries()) {
    const own = observe(slot.spec);
    const fallback = slot.previous === null ? null : observe(slot.previous);
    // The page to show: this slot's own once it has a value, else the one it replaces.
    const shown =
      own.kind === "settled"
        ? own
        : fallback !== null && fallback.kind === "settled"
          ? fallback
          : null;
    const error =
      own.kind === "failed" || (own.kind === "settled" && own.error !== null)
        ? own.error
        : null;
    if (error !== null && failure === null) {
      failure = { error, failing: slot.spec };
    }
    if (shown === null) {
      if (failure !== null) break;
      if (k === 0) return { kind: "loading" };
      // A page a grow asked is in flight: the items before it stand.
      growing = true;
      break;
    }
    if (k === 0) meta = shown.page.meta;
    for (const item of shown.page.items) {
      const id = idOf(item);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
    tailPage = shown.page;
    tailClean = slot.previous === null && clean(own);
  }
  if (failure !== null) {
    return {
      kind: "error",
      error: failure.error,
      failing: failure.failing,
      ...(tailPage !== null ? { stale: items } : {}),
      ...(meta !== undefined ? { meta } : {}),
    };
  }
  const more =
    !growing && tailPage !== null && tailPage.nextCursor !== null && tailClean;
  return {
    kind: "ready",
    items,
    meta,
    canGrow: more && state.slots.length < MAX_LIVE_PAGES,
    growing,
    truncated: more && state.slots.length >= MAX_LIVE_PAGES,
  };
}
