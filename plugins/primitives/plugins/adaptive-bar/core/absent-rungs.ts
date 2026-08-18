/**
 * The adaptive bar's blank-rung ledger: which rungs an occupant has been
 * observed to render **nothing** at.
 *
 * A pure reducer — every operation returns a new ledger and mutates nothing — so
 * the browser half can hold it in a ref and the rules below are testable without
 * a layout engine. Deliberately shaped like `./blocked-rungs`, because it is the
 * same kind of thing: a small immutable record of a per-(item, rung) fact that
 * is not a width, whose whole job is to be honest about how long what it learned
 * stays true.
 *
 * ## The fact this exists to keep, and the bug that comes of not keeping it
 *
 * "This occupant renders nothing" is a statement about an occupant **and a
 * rung**, never about an occupant alone. The bar reads it from the DOM (an empty
 * container) at whatever rung the occupant currently sits at, so an occupant
 * that renders content as `full` and nothing as `compact` produces the fact at
 * rung 1 and not at rung 0.
 *
 * Recording it as a property of the occupant is what made this cycle spellable:
 * the fit dropped an absent item from the placement ("there is nothing to
 * place"), the web half read a missing entry as rung 0 ("this item has never
 * been placed"), the widget rendered its full form again, the fit demoted it
 * back to compact, and the placement changed on every round for ever. Both
 * readings are correct; it is the conflation of the two absences that is not.
 * See `research/2026-08-18-global-adaptive-bar-absent-rung.md`.
 *
 * ## What the ledger is for
 *
 * {@link offeredRungCount} is the whole point: a rung the occupant renders
 * nothing at is not a rung the bar may put it on, so the ladder it hands the fit
 * is the declared one **cut short** at the first blank rung. The fit therefore
 * cannot place a widget where it vanishes, so it cannot un-place it for having
 * vanished, and the cycle has no spelling. An occupant blank at its widest rung
 * has no rungs at all, which is exactly what "not an occupant" means to
 * `assign`.
 *
 * Cutting the ladder rather than skipping the one rung is not a shortcut, and
 * the reason it generalizes is worth stating: **the rung index is a shared key**.
 * The same number indexes `widthKey(id, rung)`, `BlockedRungs`' inner map, and
 * `formFor`'s array of declared forms (`web/internal/ladder.ts`). Skipping rung
 * 1 while still offering rung 2 would mint a second index space — position in
 * the offered list versus position in the declared ladder — held in the same
 * `number` and silently interchangeable at every one of those call sites.
 * Cutting keeps one index space and merely shortens its range, so every existing
 * consumer stays correct with no change.
 *
 * It is also conservative rather than exact for a ladder deeper than today's two
 * rungs (`full`, `compact`): it declines rungs narrower than a blank one, which
 * can leave an occupant wider than it needed to be but can never place it
 * somewhere it renders nothing. Growing this into a per-rung legality is the one
 * direction that does NOT generalize, unless the rung type is branded first.
 *
 * ## Why anything is ever dropped
 *
 * A blank rung is a statement about the occupant's rendered content at one
 * moment, so it stops being true when that content — or the ladder its rung
 * indices are numbered against — moves. {@link clearAbsentRungs} covers both;
 * the caller knows, and the ledger cannot.
 *
 * **The rung a blank mark is about is never sat on again**, which is what makes
 * the invalidation subtle enough to get wrong: once rung `r` is cut, the fit can
 * only place the item at `0…r-1`, so nothing will ever re-measure it at `r`. The
 * only evidence that can discharge the mark is therefore evidence gathered
 * ELSEWHERE — the occupant measuring differently at the rung it *is* on — and
 * the driver clears the whole item's marks from exactly that clause. A guard
 * looking for "it renders at `r` after all" is dead code for every `r > 0`.
 *
 * The consequence is worth being honest about: an occupant whose compact form
 * comes back while its full form's width does not move is never re-offered the
 * compact rung. The bar cannot observe that, so the recovery is the widget's to
 * declare: a widget that cannot render a form right now should stop declaring
 * it, which `registry.declare` invalidates on. That, and not this ledger, is the
 * contract a widget author should be reading.
 *
 * ## One key space, two ledgers
 *
 * This ledger and `./blocked-rungs` are keyed identically — `(item id, rung)`,
 * against the DECLARED ladder — and they are cleared in lockstep at the same
 * four sites: the blank branch and the content-changed clause in `reconcile`'s
 * measure loop, the registry's unregister, and a `declare` whose rung set really
 * changed. Adding a clear to one without the other is the shape of bug to look
 * for here.
 */

/** id → the rungs that item has been observed to render nothing at. */
export type AbsentRungs = ReadonlyMap<string, ReadonlySet<number>>;

export const noAbsentRungs: AbsentRungs = new Map<
  string,
  ReadonlySet<number>
>();

/**
 * Record that `id` rendered nothing at `rung`.
 *
 * A rung index that is not a rung index records nothing rather than throwing:
 * this is called from the layout path, where the remedy for a bad number is to
 * learn nothing from it, not to take the pane down.
 */
export function markAbsentRung(
  a: AbsentRungs,
  id: string,
  rung: number,
): AbsentRungs {
  if (!Number.isInteger(rung) || rung < 0) return a;
  const rungs = a.get(id);
  if (rungs?.has(rung) === true) return a;
  const next = new Map(a);
  next.set(id, new Set(rungs === undefined ? [rung] : [...rungs, rung]));
  return next;
}

export function isAbsentRung(
  a: AbsentRungs,
  id: string,
  rung: number,
): boolean {
  return a.get(id)?.has(rung) === true;
}

/**
 * The occupant's content or ladder moved: everything this ledger holds about it
 * is hearsay.
 *
 * One function for both, exactly like `unbarItem` in `./blocked-rungs`, because
 * the two are the same event seen from either side — a rung index only means
 * anything against a ladder, and what a widget renders at one only means
 * anything about the content it was rendering at the time.
 */
export function clearAbsentRungs(a: AbsentRungs, id: string): AbsentRungs {
  if (!a.has(id)) return a;
  const next = new Map(a);
  next.delete(id);
  return next;
}

/**
 * How many rungs of `id`'s declared ladder the bar may actually offer it: the
 * declared count, cut short at the first rung it renders nothing at.
 *
 * **0 means the occupant renders nothing at its widest form** — it has a host
 * and a container and no form it renders as, which is what `assign` reads as
 * "not an occupant" (see `FitItem.inlineWidths`).
 */
export function offeredRungCount(
  a: AbsentRungs,
  id: string,
  declared: number,
): number {
  const rungs = a.get(id);
  if (rungs === undefined) return declared;
  for (let r = 0; r < declared; r++) if (rungs.has(r)) return r;
  return declared;
}
