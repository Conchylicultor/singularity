// The segmented scroll's state machine, as pure data — `useLiveScroll` feeds it
// what each segment's window read settled on and renders what it assembles.
// See `plugins/network/plugins/live/CLAUDE.md` (*Segmented scroll*) and
// research/2026-09-29-global-scoped-change-routing.md (P2, "the segmented
// scroll").
//
// A deep scroll is several windows, each ≤ `maxLimit`, that TILE the order by
// cuts — every loaded segment stays live. The one invariant everything here
// keeps or re-establishes within one handoff: the rows counted (`exhausted`,
// `canGrow`, the empty state) are a GAP-FREE PREFIX of the order — the
// segments up to and including the first full BOUNDED one (a full window with
// an upper cut may hide rows before that cut).

/** One window of the scroll: `(after, until]` in the order, at `limit` rows. */
export interface Segment {
  /** Exclusive lower cut (a server-minted row key); `null` = the order's start. */
  after: string | null;
  /** Inclusive upper cut; `null` = the order's end (the tail). */
  until: string | null;
  limit: number;
}

/** One segment's row, as the plan reads it: its id and its server-minted row key. */
export interface SegmentEntry {
  id: string;
  /** `null` = the key is over the byte bound: the scroll cannot cut at this row. */
  key: string | null;
}

/**
 * What one segment's window read says right now. `E` is the reader's error
 * type — the plan only carries it, so a reader's typed error (a live read's
 * `ResourceError`) reaches what it assembles unwidened.
 */
export type SegmentObservation<E extends Error = Error> =
  /** No value has landed yet. */
  | { kind: "pending" }
  /**
   * A value the server vouched for — the current one, or (with `error`) the
   * last one before its read failed.
   */
  | {
      kind: "settled";
      entries: readonly SegmentEntry[];
      error: E | null;
    }
  /** The first read failed: no value to show. */
  | { kind: "failed"; error: E };

/** A structural change in flight: `committed[from..to]` becomes `next` once every `next` read settles. */
export interface SegmentChange {
  from: number;
  to: number;
  next: readonly Segment[];
  /** A `loadMore()` asked for it — the footer's spinner. */
  growing: boolean;
}

export interface ScrollState {
  /** The rendered segments, tiling the order. Never empty. */
  committed: readonly Segment[];
  /** At most one change at a time; the replaced segments stay rendered until it settles. */
  change: SegmentChange | null;
  /**
   * A change one of whose replacements FAILED, set aside rather than held
   * open: its replacements stay read (so a retry re-reads them, and one that
   * recovers commits), but the scroll is idle again — a failed merge does not
   * stop the tail from paging. Never set while `change` is. The plan does not
   * re-mint it while it is still the step it would take; a different step (or
   * a `loadMore()`) supersedes it.
   */
  stalled: SegmentChange | null;
}

/** The scroll's bounds: `step` (the collection's default limit, H) and `maxLimit` (M ≥ 3H). */
export interface ScrollLimits {
  step: number;
  maxLimit: number;
}

/** A scroll holds at most this many segments; one that must split past it collapses. */
export const MAX_SCROLL_SEGMENTS = 16;

/**
 * Why a tail at `maxLimit` cannot be paged past: the scroll holds
 * `MAX_SCROLL_SEGMENTS` segments, or the tail's cut row's sort key is too long
 * to page past. A KIND, not a sentence: the surface says it in its own words.
 */
export type ScrollTruncation = "segment-cap" | "long-sort-key";

/** A truncation in the plan's own terms — for a log line, never the UI. */
export const TRUNCATION_DETAIL: Readonly<Record<ScrollTruncation, string>> = {
  "segment-cap": `the scroll holds ${MAX_SCROLL_SEGMENTS} segments`,
  "long-sort-key": "sort key too long to page past",
};

/** A new scroll: one segment over the whole order, at one step. */
export function startScroll(limits: ScrollLimits): ScrollState {
  return {
    committed: [{ after: null, until: null, limit: limits.step }],
    change: null,
    stalled: null,
  };
}

/** A settled segment's rows fill its window: there may be more past it (in its range). */
function full(seg: Segment, obs: SegmentObservation): boolean {
  return obs.kind === "settled" && obs.entries.length === seg.limit;
}

/** The cut a full segment splits at: the key of row `maxLimit − step` (1-based). */
function splitCut(
  obs: SegmentObservation,
  limits: ScrollLimits,
): string | null {
  if (obs.kind !== "settled") return null;
  return obs.entries[limits.maxLimit - limits.step - 1]?.key ?? null;
}

/** A value the server currently vouches for. */
function clean(o: SegmentObservation): boolean {
  return o.kind === "settled" && o.error === null;
}

/** Every committed segment has a value and none of their reads is failing. */
function allClean(observations: readonly SegmentObservation[]): boolean {
  return observations.every(clean);
}

/** The read's error, if it is failing (with or without a last value). */
function errorOf<E extends Error>(o: SegmentObservation<E>): E | null {
  return o.kind === "failed" ? o.error : o.kind === "settled" ? o.error : null;
}

/** `committed` with `change` applied: `committed[from..to]` → `change.next`. */
function applyChange(
  committed: readonly Segment[],
  change: SegmentChange,
): readonly Segment[] {
  if (change.to >= committed.length) {
    throw new Error(
      `scroll plan: a change over segments ${change.from}..${change.to} of ${committed.length} — the plan's indices drifted`,
    );
  }
  return [
    ...committed.slice(0, change.from),
    ...change.next,
    ...committed.slice(change.to + 1),
  ];
}

const sameChange = (a: SegmentChange, b: SegmentChange): boolean =>
  a.from === b.from &&
  a.to === b.to &&
  a.growing === b.growing &&
  JSON.stringify(a.next) === JSON.stringify(b.next);

/** What `reconcile` did, for the one report a caller owes: a progress guard firing. */
export interface ReconcileOutcome {
  state: ScrollState;
  /** Set when a split had to give up (cap, or a key that cannot be cut at). */
  collapsed?: { at: number; reason: string };
}

/**
 * Advance the plan one step against what the committed segments (and the
 * change in flight) observe. Pure and idempotent: fed its own output with the
 * same observations, it returns that output unchanged — so a caller may run it
 * on every render.
 *
 * - A change whose every replacement settled commits (the replaced segments
 *   are released). A replacement that fails SETS THE CHANGE ASIDE
 *   (`stalled`): the old segments stay on screen, the caller shows the error
 *   with a retry, and the scroll is idle again — so the tail still pages. A
 *   set-aside change whose replacements recover commits; it is not re-minted
 *   while it is still the step to take, and any other step supersedes it.
 * - Idle, and only while every committed segment is cleanly settled, it takes
 *   the FIRST applicable step, in this order:
 *   1. **empty fold** — a segment with no rows merges into its predecessor
 *      (its successor if it is the head), whatever the thresholds;
 *   2. **bounded grow / split** — the first full bounded segment (it may hide
 *      rows) grows by `step` up to `maxLimit`; at `maxLimit` it splits at row
 *      `maxLimit − step`: `(a, cut]` at `maxLimit` and `(cut, b]` at `2·step`.
 *      A split that cannot happen (the cap, or a `null` key) COLLAPSES instead:
 *      the segments after it are dropped and it becomes the tail at `maxLimit`,
 *      so the rendered rows are a gap-free prefix again;
 *   3. **merge** — two adjacent segments holding ≤ `maxLimit − 2·step` rows
 *      between them become one at `rows + step` (the hysteresis against 2).
 */
export function reconcile(
  state: ScrollState,
  observe: (seg: Segment) => SegmentObservation,
  limits: ScrollLimits,
): ReconcileOutcome {
  const { committed, change, stalled } = state;
  if (change) {
    const obs = change.next.map(observe);
    // A replacement that fails sets the change aside (`stalled`): the old
    // segments stand, and the scroll is idle again.
    if (obs.some((o) => errorOf(o) !== null)) {
      return { state: { committed, change: null, stalled: change } };
    }
    if (!obs.every(clean)) return { state };
    return {
      state: {
        committed: applyChange(committed, change),
        change: null,
        stalled: null,
      },
    };
  }
  // A set-aside change whose replacements recovered (a retry, or the server
  // answering again) commits: its replacements tile the range they replace.
  if (stalled && stalled.next.every((seg) => clean(observe(seg)))) {
    return {
      state: {
        committed: applyChange(committed, stalled),
        change: null,
        stalled: null,
      },
    };
  }
  const obs = committed.map(observe);
  if (!allClean(obs)) return { state };
  const step = nextStep(committed, obs, limits);
  if (stalled) {
    // Still the step to take: held (its failed read stays on screen with its
    // retry) rather than re-minted onto the same failing tuple.
    if (step !== null && sameChange(step.change, stalled)) return { state };
    // A page past the tail that failed stays until its retry or a
    // `loadMore()` — nothing else would re-ask for it.
    if (step === null && stalled.growing) return { state };
    // Another step comes first, or the stalled one is not needed any more.
    return {
      state: { committed, change: step?.change ?? null, stalled: null },
      ...(step?.collapsed ? { collapsed: step.collapsed } : {}),
    };
  }
  if (step === null) return { state };
  return {
    state: { committed, change: step.change, stalled: null },
    ...(step.collapsed ? { collapsed: step.collapsed } : {}),
  };
}

/** The first applicable structural step of an idle, cleanly settled scroll (see `reconcile`). */
function nextStep(
  committed: readonly Segment[],
  obs: readonly SegmentObservation[],
  limits: ScrollLimits,
): {
  change: SegmentChange;
  collapsed?: { at: number; reason: string };
} | null {
  const K = committed.length;
  const { step, maxLimit } = limits;
  const replace = (from: number, to: number, next: Segment[]) => ({
    change: { from, to, next, growing: false },
  });

  // 1. Empty fold.
  if (K > 1) {
    const i = obs.findIndex(
      (o) => o.kind === "settled" && o.entries.length === 0,
    );
    if (i === 0) {
      const next = committed[1]!;
      return replace(0, 1, [
        { after: committed[0]!.after, until: next.until, limit: next.limit },
      ]);
    }
    if (i > 0) {
      const prev = committed[i - 1]!;
      return replace(i - 1, i, [
        { after: prev.after, until: committed[i]!.until, limit: prev.limit },
      ]);
    }
  }

  // 2. The first full bounded segment grows, splits — or collapses.
  const j = committed.findIndex(
    (seg, i) => seg.until !== null && full(seg, obs[i]!),
  );
  if (j !== -1) {
    const seg = committed[j]!;
    if (seg.limit < maxLimit) {
      return replace(j, j, [
        { ...seg, limit: Math.min(maxLimit, seg.limit + step) },
      ]);
    }
    const cut = splitCut(obs[j]!, limits);
    const reason =
      cut === null
        ? TRUNCATION_DETAIL["long-sort-key"]
        : K >= MAX_SCROLL_SEGMENTS
          ? TRUNCATION_DETAIL["segment-cap"]
          : cut === seg.until
            ? "the cut would not shrink the segment"
            : null;
    if (reason !== null) {
      return {
        ...replace(j, K - 1, [
          { after: seg.after, until: null, limit: maxLimit },
        ]),
        collapsed: { at: j, reason },
      };
    }
    return replace(j, j, [
      { after: seg.after, until: cut, limit: maxLimit },
      { after: cut, until: seg.until, limit: 2 * step },
    ]);
  }

  // 3. Merge.
  const threshold = maxLimit - 2 * step;
  for (let i = 0; i + 1 < K; i++) {
    const a = obs[i]!;
    const b = obs[i + 1]!;
    if (a.kind !== "settled" || b.kind !== "settled") continue;
    const rows = a.entries.length + b.entries.length;
    if (rows <= threshold) {
      return replace(i, i + 1, [
        {
          after: committed[i]!.after,
          until: committed[i + 1]!.until,
          limit: rows + step,
        },
      ]);
    }
  }
  return null;
}

/** Why the settled tail cannot be paged past, or `null` when it can (or is not full at `maxLimit`). */
export function tailTruncation(
  state: ScrollState,
  observe: (seg: Segment) => SegmentObservation,
  limits: ScrollLimits,
): ScrollTruncation | null {
  const tail = state.committed[state.committed.length - 1]!;
  const o = observe(tail);
  if (!full(tail, o) || tail.limit < limits.maxLimit) return null;
  if (splitCut(o, limits) === null) return "long-sort-key";
  if (state.committed.length >= MAX_SCROLL_SEGMENTS) return "segment-cap";
  return null;
}

/**
 * Page past the tail (`loadMore()`): grow it by `step` up to `maxLimit`, or —
 * at `maxLimit` — split it at row `maxLimit − step`: `(a, cut]` at
 * `maxLimit`, and `(cut, +∞)` at `2·step` (the rows it already showed past the
 * cut, plus one step more). Nothing while a change is in flight, the tail is
 * not full and cleanly settled, or it cannot be split (`tailTruncation`). A
 * set-aside change is superseded (the plan re-mints it after, if it is still
 * needed).
 */
export function growTail(
  state: ScrollState,
  observe: (seg: Segment) => SegmentObservation,
  limits: ScrollLimits,
): ScrollState {
  if (state.change) return state;
  const K = state.committed.length;
  const tail = state.committed[K - 1]!;
  const o = observe(tail);
  if (o.kind !== "settled" || o.error !== null || !full(tail, o)) return state;
  if (tail.limit < limits.maxLimit) {
    return {
      committed: state.committed,
      change: {
        from: K - 1,
        to: K - 1,
        next: [
          {
            ...tail,
            limit: Math.min(limits.maxLimit, tail.limit + limits.step),
          },
        ],
        growing: true,
      },
      stalled: null,
    };
  }
  if (tailTruncation(state, observe, limits) !== null) return state;
  const cut = splitCut(o, limits)!;
  return {
    committed: state.committed,
    change: {
      from: K - 1,
      to: K - 1,
      next: [
        { after: tail.after, until: cut, limit: limits.maxLimit },
        { after: cut, until: null, limit: 2 * limits.step },
      ],
      growing: true,
    },
    stalled: null,
  };
}

/** The segment a committed index renders, or its failing replacement. */
export interface SegmentFailure<E extends Error = Error> {
  /** The committed segment whose rows stay on screen. */
  index: number;
  /** The read that failed: the committed segment's own, or a replacement's. */
  failed: Segment;
  error: E;
  /**
   * Paging is stopped on it: the tail's own read, a failed page past the
   * tail, or — when the scroll can neither grow nor is exhausted and nothing
   * is in flight — every failure (one of them is what holds it).
   */
  blocksPaging: boolean;
}

/** What the committed segments assemble into, over the gap-free prefix. */
export interface Assembly<E extends Error = Error> {
  /** Each committed segment's entries, concatenated in order, deduped by id (first wins). */
  entries: readonly SegmentEntry[];
  /** Every committed segment has a value (the head's first read may not). */
  loaded: boolean;
  /** No rows past what is loaded: the prefix reaches the tail and the tail is not full. */
  exhausted: boolean;
  /** `loadMore()` would add rows: the prefix reaches a full tail that can be paged past. */
  canGrow: boolean;
  /** A `loadMore()` is in flight and none of its reads has failed. */
  growing: boolean;
  truncated: ScrollTruncation | null;
  /** Reads failing under rows still on screen: committed segments and replacements. */
  failures: readonly SegmentFailure<E>[];
  /** The head's first read failed — no row to show. */
  headError: E | null;
}

export function assemble<E extends Error>(
  state: ScrollState,
  observe: (seg: Segment) => SegmentObservation<E>,
  limits: ScrollLimits,
): Assembly<E> {
  const { committed, change, stalled } = state;
  const K = committed.length;
  const obs = committed.map(observe);
  const seen = new Set<string>();
  const entries: SegmentEntry[] = [];
  for (const o of obs) {
    if (o.kind !== "settled") continue;
    for (const e of o.entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  }
  const head = obs[0]!;
  const loaded = obs.every((o) => o.kind === "settled");
  // The gap-free prefix ends at the first full bounded segment.
  const gap = committed.findIndex(
    (seg, i) => seg.until !== null && full(seg, obs[i]!),
  );
  const tail = committed[K - 1]!;
  const tailObs = obs[K - 1]!;
  const truncated = tailTruncation(state, observe, limits);
  const exhausted =
    loaded && gap === -1 && change === null && !full(tail, tailObs);
  const canGrow =
    loaded &&
    gap === -1 &&
    change === null &&
    full(tail, tailObs) &&
    truncated === null;
  // Nothing in flight, nothing more to page, not the end and not truncated:
  // a failing read is what holds the scroll where it is.
  const stuck =
    loaded && change === null && !exhausted && !canGrow && truncated === null;

  const failures: SegmentFailure<E>[] = [];
  obs.forEach((o, index) => {
    const error = errorOf(o);
    if (error === null) return;
    failures.push({
      index,
      failed: committed[index]!,
      error,
      blocksPaging: stuck || index === K - 1,
    });
  });
  // The replacements of the change in flight (for the one pass before
  // `reconcile` sets a failed one aside) and of the set-aside one.
  let replacementFailed = false;
  for (const c of [change, stalled]) {
    if (c === null) continue;
    for (const seg of c.next) {
      const error = errorOf(observe(seg));
      if (error === null) continue;
      replacementFailed = true;
      // The replacement covering the committed range: the old rows stay.
      failures.push({
        index: c.from,
        failed: seg,
        error,
        blocksPaging: stuck || c.growing,
      });
    }
  }
  return {
    entries,
    loaded,
    exhausted,
    canGrow,
    growing: change !== null && change.growing && !replacementFailed,
    truncated,
    failures,
    headError: head.kind === "failed" ? head.error : null,
  };
}

/** Every segment read the state needs: the committed ones and the change's replacements. */
export function segmentsOf(state: ScrollState): readonly Segment[] {
  const extra = state.change ?? state.stalled;
  return extra ? [...state.committed, ...extra.next] : state.committed;
}
