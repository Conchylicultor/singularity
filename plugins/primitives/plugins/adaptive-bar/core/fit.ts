/**
 * The adaptive bar's fit math: given a width and a ladder of forms per item,
 * decide which rung each item renders at and which items leave the row.
 *
 * Pure on purpose — no DOM, no React. The browser half measures and relocates;
 * every *decision* is made here, so it can be exercised without a layout engine.
 *
 * Design: <../../../../../research/2026-08-16-global-adaptive-bar-relocating-overflow.md>
 * (§ "Measurement and fit").
 */

/** One item's participation in the row. */
export interface FitItem {
  id: string;
  /**
   * Inline widths per rung, **widest first** (rung 0 is the widest form the
   * widget can render). `undefined` = that rung has never been measured.
   * Length ≥ 1 — even a widget with no smaller form has one rung.
   *
   * The array is monotone by construction: a narrower rung is never wider than
   * a wider one. `assign` relies on that to bound an unmeasured rung from a
   * measured wider one — see {@link resolveWidth}.
   */
  inlineWidths: readonly (number | undefined)[];
  /** Can this item leave the row entirely (relocate to a panel, or be clipped)? */
  evictable: boolean;
  /**
   * Yield order. **Higher yields sooner**: the highest-ranked item is demoted
   * first, so a widget that declared itself eager outranks a normal one, and a
   * widget that declared `"never"` gets the lowest rank and is the last thing
   * the bar touches.
   */
  yieldRank: number;
  /** Frozen at `currentRung` — a live drag or an open popup. */
  pinned?: boolean;
  /** Current rung index, or `null` if currently evicted. */
  currentRung: number | null;
  /** The item rendered nothing: contributes no width, no gap, and never evicts. */
  absent?: boolean;
}

export interface FitInput {
  available: number;
  gap: number;
  /** Width reserved when ≥1 item is evicted. 0 when the host shows no trigger. */
  triggerPx: number;
  hysteresisPx: number;
  items: readonly FitItem[];
  /** Rungs an item may not re-enter until the row is wider. */
  blocked?: ReadonlyMap<string, { rung: number; atWidth: number }>;
}

export interface FitResult {
  /** id → rung index, or `null` for evicted. Contains every non-absent item. */
  placement: ReadonlyMap<string, number | null>;
  /** True when any width used in the decision was an estimate rather than a measurement. */
  usedEstimate: boolean;
  /**
   * Does the returned placement actually fit? `false` means the row is at its
   * floor and still overflows (or a width is unknown and no bound exists), so
   * the host must clip / scroll rather than believe the layout. Paired with
   * {@link FitResult.usedEstimate} this is the difference between "fits" and
   * "probably fits" — never collapse the two into a bare boolean.
   */
  fits: boolean;
  /**
   * Demotions performed. Diagnostic only, but load-bearing for the termination
   * proof: it is bounded by Σ stepsRemaining, so a test can assert the loop
   * cannot run away rather than trusting the argument.
   */
  iterations: number;
}

/**
 * How confidently we know an item's width at one rung.
 *
 * `bounded` is the monotone bound: the rung itself was never measured, but a
 * *wider* rung was, and a narrower form is never wider than a wider one — so
 * that measurement is an upper bound. An upper bound can only make the row look
 * too wide, i.e. it can refuse a fit but never fabricate one, which is exactly
 * the guarantee we need from an estimate.
 *
 * `unbounded` is the dangerous case: nothing is known at this rung or any wider
 * one, so there is no upper bound at all. Substituting 0 there *would* fabricate
 * a fit, so a configuration containing one is reported as not fitting.
 */
type ResolvedWidth =
  | { kind: "exact"; px: number }
  | { kind: "bounded"; px: number }
  | { kind: "unbounded" };

function resolveWidth(
  widths: readonly (number | undefined)[],
  rung: number,
): ResolvedWidth {
  const own = widths[rung];
  if (own !== undefined) return { kind: "exact", px: own };
  // Only *wider* rungs (lower indices) bound this one. A narrower rung is a
  // lower bound, and a lower bound is precisely what would fabricate a fit.
  for (let j = rung - 1; j >= 0; j--) {
    const w = widths[j];
    if (w !== undefined) return { kind: "bounded", px: w };
  }
  return { kind: "unbounded" };
}

/** Mutable per-item state during the search. */
interface Placed {
  readonly item: FitItem;
  readonly index: number;
  /**
   * False until the item has been placed once. The aggregates below are updated
   * by difference, so the very first placement must not subtract a contribution
   * that was never added.
   */
  seated: boolean;
  /** Current rung, or `null` for evicted. */
  rung: number | null;
  /** What this item currently adds to `sum` (0 when evicted or unbounded). */
  contributed: number;
  /** Whether the currently-counted width is an estimate, and of which flavour. */
  contributedKind: ResolvedWidth["kind"] | "none";
  /**
   * Set once the item has stepped INTO a rung whose width is an estimate.
   *
   * "Never skip a rung while estimating": the estimate for rung k+1 is the
   * width of rung k, so a chain of demotions driven by estimates would relocate
   * an item that compaction alone would have saved — and we would never learn
   * otherwise, because only inline nodes are measurable. Capping the item at one
   * estimated step costs one extra pass and makes that unlearnable state
   * unreachable.
   */
  spentEstimatedStep: boolean;
}

/**
 * Assign every item a rung (or eviction) for the given width.
 *
 * The search starts every unpinned item at its widest allowed rung and only ever
 * demotes, so the answer is a function of `available` and the widths — not of
 * where the items happen to be right now. `currentRung` is read for exactly two
 * things: freezing a `pinned` item, and the H1 promote band below.
 */
export function assign(input: FitInput): FitResult {
  const { available, gap, triggerPx, hysteresisPx, items, blocked } = input;

  // An absent item rendered nothing. It has a host and a 0×0 container, but it
  // is not an occupant: no width, no gap, no eviction, and no entry in the
  // placement (there is nothing to place).
  const active = items.filter((i) => i.absent !== true);

  const states: Placed[] = active.map((item, index) => ({
    item,
    index,
    seated: false,
    rung: null,
    contributed: 0,
    contributedKind: "none",
    spentEstimatedStep: false,
  }));

  // ── Running aggregates ────────────────────────────────────────────────────
  // The total is maintained incrementally: every demotion is an O(1) update of
  // these counters, never a re-sum over the row. Re-summing per candidate is
  // what turns an O(n) pass into an O(n²) one.
  let sum = 0;
  let inlineCount = 0;
  let evictedCount = 0;
  let unboundedCount = 0;
  let usedEstimate = false;

  const total = (): number => {
    // The trigger is one more element in the row, so it pays for one more gap —
    // and it is reserved exactly once no matter how many items are evicted.
    const elements = inlineCount + (evictedCount > 0 ? 1 : 0);
    return (
      sum + (evictedCount > 0 ? triggerPx : 0) + gap * Math.max(0, elements - 1)
    );
  };

  const doesFit = (): boolean => unboundedCount === 0 && total() <= available;

  /** Move `p` to `rung` (or `null`), keeping the aggregates in step. */
  const place = (p: Placed, rung: number | null): void => {
    if (p.seated) {
      if (p.rung !== null) {
        sum -= p.contributed;
        inlineCount -= 1;
        if (p.contributedKind === "unbounded") unboundedCount -= 1;
      } else {
        evictedCount -= 1;
      }
    }
    p.seated = true;

    p.rung = rung;
    if (rung === null) {
      p.contributed = 0;
      p.contributedKind = "none";
      evictedCount += 1;
      return;
    }

    const w = resolveWidth(p.item.inlineWidths, rung);
    p.contributedKind = w.kind;
    p.contributed = w.kind === "unbounded" ? 0 : w.px;
    sum += p.contributed;
    inlineCount += 1;
    if (w.kind === "unbounded") unboundedCount += 1;
    // Sticky: the flag answers "was an estimate used in this decision", which
    // includes an estimate that only ever appeared in a rejected candidate.
    if (w.kind !== "exact") usedEstimate = true;
  };

  const rungCount = (p: Placed): number => p.item.inlineWidths.length;

  const isBlocked = (p: Placed, rung: number): boolean => {
    const bar = blocked?.get(p.item.id);
    if (bar === undefined || bar.rung !== rung) return false;
    // H2: the rung is barred until the row is genuinely wider than it was when
    // the promotion into it was measured and failed. `>` not `>=`, and the
    // hysteresis on top, so re-entry is never triggered by the same width that
    // just rejected it.
    return !(available > bar.atWidth + hysteresisPx);
  };

  /** The next rung at or after `from` that H2 allows, or `null` if none. */
  const nextAllowedFrom = (p: Placed, from: number): number | null => {
    for (let r = from; r < rungCount(p); r++) {
      if (!isBlocked(p, r)) return r;
    }
    return null;
  };

  /** The state one demotion step below `p`'s current one, or `null` if it is at its floor. */
  const nextState = (p: Placed): { rung: number | null } | null => {
    if (p.rung === null) return null; // evicted is the floor
    const next = nextAllowedFrom(p, p.rung + 1);
    if (next !== null) return { rung: next };
    return p.item.evictable ? { rung: null } : null;
  };

  // Seed: widest allowed rung for everyone unpinned; pinned items are frozen
  // wherever they are, because moving a widget mid-drag or mid-popover destroys
  // the interaction the freeze exists to protect.
  const frozen = new Set<string>();
  for (const p of states) {
    if (p.item.pinned === true) {
      frozen.add(p.item.id);
      place(p, clampCurrent(p.item));
      continue;
    }
    const start = nextAllowedFrom(p, 0);
    if (start !== null) {
      place(p, start);
    } else if (p.item.evictable) {
      // Every rung is barred and the item can leave — the panel is its only
      // legal state.
      place(p, null);
    } else {
      // Every rung is barred and the item cannot leave. Something must render,
      // so the bar is ignored rather than the widget disappearing: a stale H2
      // entry must never be able to unmount a mandatory control.
      place(p, 0);
    }
  }

  // Demotion order: highest yieldRank first, ties broken by the LATER item in
  // `items` order (the tail of a bar is conventionally the least important).
  //
  // One sort plus one advancing cursor, never a rescan: demotability is
  // monotone — an item that has reached its floor or spent its estimated step
  // never becomes demotable again within a call — so once the cursor passes an
  // item it never has to come back. That is what keeps this O(n log n) instead
  // of an O(n²) "scan for the best candidate" loop.
  const order = states
    .filter((p) => !frozen.has(p.item.id))
    .sort((a, b) => b.item.yieldRank - a.item.yieldRank || b.index - a.index);

  const isDemotable = (p: Placed): boolean =>
    !p.spentEstimatedStep && nextState(p) !== null;

  let iterations = 0;
  let cursor = 0;
  while (!doesFit()) {
    while (cursor < order.length && !isDemotable(order[cursor]!)) cursor++;
    if (cursor >= order.length) break; // nothing left to give: this is the floor
    const p = order[cursor]!;
    const next = nextState(p)!;
    if (next.rung !== null) {
      const w = resolveWidth(p.item.inlineWidths, next.rung);
      if (w.kind !== "exact") p.spentEstimatedStep = true;
    }
    place(p, next.rung);
    iterations++;
  }

  // ── H1, the promote band ──────────────────────────────────────────────────
  // A demotion is accepted when `total > available`; a *promotion* — any item
  // ending wider than where it currently sits — only when the result clears the
  // width by `hysteresisPx`. The two predicates are disjoint, so no single width
  // both demands a demote and permits the matching promote, which is what stops
  // a row from flickering across a one-pixel resize.
  //
  // This is the ONLY place an unpinned item's `currentRung` is read. Refusing a
  // promotion can only leave items narrower than the computed ideal, so the
  // result still fits; the refusal is recorded nowhere and evaporates as soon as
  // the row is genuinely wider.
  const promoting = states.filter(
    (p) => !frozen.has(p.item.id) && isPromotion(p.item, p.rung),
  );
  if (promoting.length > 0 && !(total() + hysteresisPx <= available)) {
    for (const p of promoting) place(p, clampCurrent(p.item));
  }

  const placement = new Map<string, number | null>();
  for (const p of states) placement.set(p.item.id, p.rung);

  return { placement, usedEstimate, fits: doesFit(), iterations };
}

/**
 * The item's current state, coerced to something it can legally occupy.
 *
 * A `currentRung` outside the ladder (the widget's rung count changed under us)
 * or `null` on a non-evictable item is stale bookkeeping, not an instruction to
 * unmount a control — clamp rather than trust it.
 */
function clampCurrent(item: FitItem): number | null {
  if (item.currentRung === null) return item.evictable ? null : 0;
  const last = item.inlineWidths.length - 1;
  return Math.min(Math.max(item.currentRung, 0), last);
}

/** Is landing at `rung` wider than where the item currently is? */
function isPromotion(item: FitItem, rung: number | null): boolean {
  const current = clampCurrent(item);
  if (current === null) return rung !== null; // re-entering the row is the widest promotion there is
  if (rung === null) return false;
  return rung < current; // lower index = wider form
}
