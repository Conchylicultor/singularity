/**
 * The adaptive bar's width ledger: what each item measured at each rung, and
 * how confident we are about it.
 *
 * A pure reducer — every operation returns a new cache and mutates nothing — so
 * the browser half can hold it in a ref and the rules below are testable without
 * a layout engine.
 *
 * The load-bearing asymmetry: we only ever measure the rung an item is
 * *currently rendering inline*. A width read anywhere else is either wrong (the
 * panel lays out differently) or unobtainable, so the ledger's job is to keep
 * what it legitimately learned and to be honest about the rest.
 */

/** One measured (or once-measured) width. */
export interface MeasuredWidth {
  px: number;
  /**
   * True when this value was measured for THIS rung and nothing has invalidated
   * it since. False means "this was true once" — kept as an estimate rather than
   * deleted, because deletion strands the item: an item sitting at rung 1 is
   * only measurable at rung 1, so dropping rung 1's entry removes the only way
   * the row can ever reason about it again.
   */
  exact: boolean;
}

export type WidthCache = ReadonlyMap<string, MeasuredWidth>;

export const emptyWidthCache: WidthCache = new Map<string, MeasuredWidth>();

/** The ledger key: the item id, a space, the rung index. */
export function widthKey(id: string, rung: number): string {
  return `${id} ${rung}`;
}

/**
 * Recover the item id from a ledger key.
 *
 * Split at the LAST space, never the first, and never by prefix match: item ids
 * are contribution ids minted by arbitrary plugins, so one may well contain a
 * space. A prefix scan for `"a "` would happily match the key of an item called
 * `"a 1"`, and `dropItem("a")` would silently delete a different widget's
 * measurements.
 */
export function widthKeyItemId(key: string): string {
  const at = key.lastIndexOf(" ");
  if (at === -1) {
    throw new Error(
      `adaptive-bar: malformed width-cache key ${JSON.stringify(key)}`,
    );
  }
  return key.slice(0, at);
}

export interface WidthMeasurement {
  id: string;
  rung: number;
  px: number;
  /**
   * Was the node docked INLINE when this width was read? The caller knows; the
   * ledger cannot. A width read while the item sits in the panel describes the
   * panel's layout, not the row's, and writing it would poison every later fit.
   */
  dockedInline: boolean;
}

/**
 * Why a measurement was not written. A refusal is not an absorbable value: the
 * cache comes back unchanged either way, so a caller that ignored the result
 * could not tell a stored width from a discarded one.
 */
export type WriteRefusal =
  /**
   * "Measured 0" means the contribution rendered nothing — an absent item, not
   * an item of width 0. Absence is decided from the DOM (an empty container),
   * never from a 0 in this ledger, so a 0 must never become a stored width.
   */
  | "rendered-nothing"
  /** Read while the item was docked in the panel. */
  | "not-inline"
  /** Negative, NaN or Infinity — not a width at all. */
  | "not-a-width";

export type WriteResult =
  | { ok: true; cache: WidthCache }
  | { ok: false; reason: WriteRefusal; cache: WidthCache };

/** Record a width measured for the rung the item is currently rendering. */
export function write(cache: WidthCache, m: WidthMeasurement): WriteResult {
  if (!Number.isFinite(m.px) || m.px < 0) {
    return { ok: false, reason: "not-a-width", cache };
  }
  if (m.px === 0) return { ok: false, reason: "rendered-nothing", cache };
  if (!m.dockedInline) return { ok: false, reason: "not-inline", cache };

  const next = new Map(cache);
  next.set(widthKey(m.id, m.rung), { px: m.px, exact: true });
  return { ok: true, cache: next };
}

/**
 * The item's content changed and we re-measured `keptRung`. Every OTHER rung of
 * that item is now hearsay: keep the number as an estimate, drop the claim that
 * it is exact.
 */
export function staleOthers(
  cache: WidthCache,
  id: string,
  keptRung: number,
): WidthCache {
  const keep = widthKey(id, keptRung);
  let changed = false;
  const next = new Map(cache);
  for (const [key, value] of cache) {
    if (key === keep || !value.exact || widthKeyItemId(key) !== id) continue;
    next.set(key, { px: value.px, exact: false });
    changed = true;
  }
  return changed ? next : cache;
}

/** The item left the bar for good. */
export function dropItem(cache: WidthCache, id: string): WidthCache {
  let changed = false;
  const next = new Map(cache);
  for (const key of cache.keys()) {
    if (widthKeyItemId(key) !== id) continue;
    next.delete(key);
    changed = true;
  }
  return changed ? next : cache;
}

/**
 * What we know about one item at one rung.
 *
 * `estimate` is the monotone bound: a narrower form is never wider than a wider
 * one, so a measurement at any rung ≤ `rung` is an upper bound for `rung`. Only
 * an upper bound is safe — it can refuse a fit but never fabricate one. A
 * measurement at a *narrower* rung is a lower bound and is deliberately never
 * used.
 */
export type WidthEstimate =
  | { kind: "exact"; px: number }
  | { kind: "estimate"; px: number; fromRung: number }
  | { kind: "unknown" };

export function estimate(
  cache: WidthCache,
  id: string,
  rung: number,
): WidthEstimate {
  for (let r = rung; r >= 0; r--) {
    const entry = cache.get(widthKey(id, r));
    if (entry === undefined) continue;
    if (r === rung && entry.exact) return { kind: "exact", px: entry.px };
    return { kind: "estimate", px: entry.px, fromRung: r };
  }
  return { kind: "unknown" };
}

/**
 * The ledger in the shape `assign` consumes: one slot per rung, `undefined`
 * wherever we do not have an exact measurement.
 *
 * Deliberately does NOT fill the gaps with estimates. `assign` derives the same
 * monotone bound itself, from the same rule — handing it a pre-substituted
 * number would make a stale value indistinguishable from a measured one, and it
 * is precisely that distinction that decides whether a fit can be trusted.
 */
export function inlineWidthsFor(
  cache: WidthCache,
  id: string,
  rungCount: number,
): (number | undefined)[] {
  const widths: (number | undefined)[] = [];
  for (let r = 0; r < rungCount; r++) {
    const known = estimate(cache, id, r);
    widths.push(known.kind === "exact" ? known.px : undefined);
  }
  return widths;
}
