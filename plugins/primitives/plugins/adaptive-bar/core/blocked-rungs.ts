/**
 * The adaptive bar's H2 ledger: which rungs a committed promotion was measured
 * as not fitting, and the width that rejected each one.
 *
 * A pure reducer — every operation returns a new ledger and mutates nothing —
 * so the browser half can hold it in a ref and the rules below are testable
 * without a layout engine. Deliberately shaped like `core/width-cache.ts`,
 * because it is the same kind of thing: a small immutable record of what the
 * row has learned, whose whole job is to be honest about how long what it
 * learned stays true.
 *
 * ## What H2 is
 *
 * The bar promotes an occupant, commits, and measures the result. When the
 * promotion does not fit, that rung is barred **until the row is genuinely
 * wider than the width that rejected it**. Without the bar the search promotes,
 * measures, demotes, promotes again — forever, at a width that never changed.
 *
 * ## Why per (item, rung), and not one bar per item
 *
 * A single `{rung, atWidth}` per item loses live constraints by overwriting
 * them: rung 0 is rejected at 500px, the row shrinks, rung 1 is rejected at
 * 300px, and at 400px BOTH rungs read as free although 500 rejected rung 0.
 * Storing per rung and keeping the widest width per (item, rung) makes that
 * unspellable — a second rejection can never erase a first.
 *
 * ## The monotone implication, which is the other half of the same fix
 *
 * Rung 0 is the WIDEST form and inline widths are monotone by construction (see
 * `FitItem.inlineWidths`) — a narrower rung is never wider than a wider one. So
 * a rejection at rung `j` is a rejection at every rung wider than `j`:
 *
 * > rung `r` is barred ⟺ ∃ `j ≥ r` with `!(available > rejectedAt[j] + hysteresisPx)`
 *
 * An exact `rung === r` match instead lets the fit promote straight past the
 * rung it just learned does not fit — barring rung 1 would silently unbar rung
 * 0, which is wider and therefore even less likely to fit. {@link isBarred}
 * reads the whole suffix for that reason, and it is why "bar a second rung" can
 * never weaken the first one.
 *
 * ## Why anything is ever dropped
 *
 * A bar is a statement about the occupant's rendered content at one moment, so
 * it stops being true when that content, that ladder, or the row's width moves.
 * {@link unbarItem} covers the first two (the caller knows; the ledger cannot),
 * and {@link sweepBarred} covers the third — which is not memory hygiene, the
 * ledger being bounded by items × rungs either way. It is the difference
 * between a bar that expires when its own stated condition is met and one that
 * lies dormant and reactivates later, on a row that has been re-laid-out and
 * re-measured since.
 */

/**
 * id → rung → the widest width at which a committed promotion into that rung
 * was undone.
 *
 * `ReadonlyMap` all the way down: the browser half holds one of these in a ref
 * and hands it straight to `assign`, so a nested map anyone could write to
 * would make "who changed this" unanswerable.
 */
export type BlockedRungs = ReadonlyMap<string, ReadonlyMap<number, number>>;

export const emptyBlockedRungs: BlockedRungs = new Map<
  string,
  ReadonlyMap<number, number>
>();

/**
 * Record a rejection: a promotion into `rung` was committed at `atWidth` and
 * measured as not fitting.
 *
 * Keeps the **widest** width per (item, rung) — a wider rejection subsumes a
 * narrower one, so a later, narrower rejection can never discharge an earlier
 * wider bar. Returns the ledger unchanged when the stored width already covers
 * this one.
 *
 * A width that is not a width records nothing rather than throwing: this is
 * called from the layout path, where the remedy for a bad number is to learn
 * nothing from it, not to take the pane down.
 */
export function barRung(
  b: BlockedRungs,
  id: string,
  rung: number,
  atWidth: number,
): BlockedRungs {
  if (!Number.isFinite(atWidth) || atWidth < 0) return b;
  const rungs = b.get(id);
  const recorded = rungs?.get(rung);
  if (recorded !== undefined && recorded >= atWidth) return b;
  const nextRungs = new Map(rungs);
  nextRungs.set(rung, atWidth);
  const next = new Map(b);
  next.set(id, nextRungs);
  return next;
}

/**
 * Is `rung` barred at this width?
 *
 * True when ANY rung at or narrower than it (`j ≥ rung`, since rung 0 is the
 * widest form) was rejected at a width this row has not yet beaten — the
 * monotone implication documented at the top of this file.
 *
 * `>` and not `>=`, with the hysteresis on top, so re-entry is never triggered
 * by the same width that just rejected it.
 */
export function isBarred(
  b: BlockedRungs,
  id: string,
  rung: number,
  available: number,
  hysteresisPx: number,
): boolean {
  const rungs = b.get(id);
  if (rungs === undefined) return false;
  for (const [j, atWidth] of rungs) {
    if (j < rung) continue;
    if (!(available > atWidth + hysteresisPx)) return true;
  }
  return false;
}

/**
 * Forget everything about one item — it left the bar, its ladder was
 * re-declared, or its own rendered width moved.
 *
 * A rung index only means anything against a ladder, and a rejection only means
 * anything about the content it was measured on; when either changes, every bar
 * recorded against the old one names a form that no longer exists.
 */
export function unbarItem(b: BlockedRungs, id: string): BlockedRungs {
  if (!b.has(id)) return b;
  const next = new Map(b);
  next.delete(id);
  return next;
}

/**
 * Drop every bar this width has beaten: the row is genuinely wider than the
 * width that rejected the rung, so the bar is discharged by its own terms
 * rather than left dormant.
 *
 * Same predicate as {@link isBarred}, so a bar that this sweep keeps is exactly
 * a bar that would still refuse a promotion.
 */
export function sweepBarred(
  b: BlockedRungs,
  available: number,
  hysteresisPx: number,
): BlockedRungs {
  let changed = false;
  const next = new Map<string, ReadonlyMap<number, number>>();
  for (const [id, rungs] of b) {
    const kept = new Map<number, number>();
    for (const [rung, atWidth] of rungs) {
      if (available > atWidth + hysteresisPx) {
        changed = true;
        continue;
      }
      kept.set(rung, atWidth);
    }
    // An item with no bars left is not an item with an empty ledger — there is
    // nothing left to say about it, so it leaves the map entirely.
    if (kept.size === 0) continue;
    next.set(id, kept);
  }
  return changed ? next : b;
}
