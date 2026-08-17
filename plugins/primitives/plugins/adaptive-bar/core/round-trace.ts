/**
 * What each measure-and-decide round decided FROM, and what moved between two
 * of them.
 *
 * The bar's termination assertion counts rounds. That count is only evidence of
 * a search that does not converge while the thing being searched holds still —
 * so the bar has to be able to say, of any two consecutive rounds, whether they
 * were answering the same question. This module is that comparison, plus the
 * bounded ring of rounds a fault carries as its evidence.
 *
 * Pure on purpose, like the rest of `core/`: no DOM, no React. The browser half
 * measures; deciding what a measurement MEANS is testable without a layout
 * engine.
 */

/** One occupant, as one round measured it. */
export interface RoundItem {
  id: string;
  /** The rung it was rendering at when this width was read. */
  rung: number;
  px: number;
}

/**
 * One round's premise: everything the decision reads that the decision itself
 * does not cause.
 *
 * `decided` is filled in after the fit runs — it is this round's OUTPUT, kept
 * only so a repeat can be recognised as a cycle rather than as a moving premise.
 * The two diagnoses call for different fixes, so the evidence has to tell them
 * apart.
 */
export interface Round {
  /** The row's own width. */
  available: number;
  /** Ordered occupant ids + ladder depths — the row's shape, as one key. */
  shape: string;
  /** Every occupant measured this round (only inline nodes are measurable). */
  items: readonly RoundItem[];
  /** The placement this round decided, as a comparable key. */
  decided?: string;
}

/** One occupant's rendered width moving at a rung it was already sitting at. */
export interface MovedWidth {
  id: string;
  rung: number;
  from: number;
  to: number;
}

/**
 * Why two consecutive rounds were not the same question.
 *
 * All three arms are "the premise moved", but they are different bugs and the
 * evidence keeps them apart: a resized row is the user, a changed shape is a
 * contribution mounting, and a moved width is a widget resizing itself.
 */
export interface PremiseShift {
  /** The row was given a different width. */
  resized: boolean;
  /** An occupant appeared, left, or changed its ladder. */
  reshaped: boolean;
  /** Occupants whose own rendered width moved at an UNCHANGED rung. */
  moved: readonly MovedWidth[];
}

export function isShifted(shift: PremiseShift): boolean {
  return shift.resized || shift.reshaped || shift.moved.length > 0;
}

/**
 * Did the premise move between `prev` and `next`?
 *
 * **Only a width at an UNCHANGED rung counts**, and that restriction is the
 * whole correctness argument. An occupant that just changed rung is *supposed*
 * to measure differently — that is the mechanism, not a disturbance — so
 * counting it would reset the round counter on every round of the bar's own
 * self-inflicted chain and remove the termination bound entirely. A width that
 * moved at a rung the item was already sitting at is the opposite: nothing the
 * search did explains it, so the rounds before it were deciding from numbers
 * that no longer exist.
 *
 * `epsilon` keeps sub-pixel layout jitter out of the answer. Fractional rects
 * are normal and a fraction of a pixel is not a widget resizing itself; without
 * the tolerance every round on a real page would read as a moving premise, which
 * is the same mistake as the one being fixed, inverted.
 */
export function premiseShift(
  prev: Round,
  next: Round,
  epsilon: number,
): PremiseShift {
  const moved: MovedWidth[] = [];
  if (prev.shape === next.shape) {
    const before = new Map(prev.items.map((i) => [i.id, i]));
    for (const item of next.items) {
      const was = before.get(item.id);
      if (was === undefined || was.rung !== item.rung) continue;
      if (Math.abs(was.px - item.px) <= epsilon) continue;
      moved.push({ id: item.id, rung: item.rung, from: was.px, to: item.px });
    }
  }
  return {
    resized: Math.abs(prev.available - next.available) > epsilon,
    reshaped: prev.shape !== next.shape,
    moved,
  };
}

/** Append `round`, dropping the oldest once the ring is full. */
export function pushRound(ring: Round[], round: Round, capacity: number): void {
  ring.push(round);
  while (ring.length > capacity) ring.shift();
}

/**
 * The moves seen so far in one episode, collapsed per (item, rung).
 *
 * An occupant whose width flips every round produces one move per round; the
 * useful record is "this one moved, between these two widths", not a hundred
 * copies of it. `from` keeps the FIRST width seen and `to` the latest, so the
 * pair brackets the movement.
 */
export function recordMoves(
  into: Map<string, MovedWidth>,
  moves: readonly MovedWidth[],
): void {
  for (const move of moves) {
    const key = `${move.id} ${String(move.rung)}`;
    const seen = into.get(key);
    if (seen === undefined) into.set(key, { ...move });
    else seen.to = move.to;
  }
}

/** What a `no-convergence` fault carries, so the next reader does not have to reproduce it. */
export interface ConvergenceEvidence {
  /** Rounds at a premise that held still — the search's own cost. */
  rounds: number;
  /** Times the premise moved without the search ever settling. */
  shifts: number;
  /** Rounds since the last settled answer, whatever the reason. */
  total: number;
  /** Distinct row widths this episode decided from, oldest first. */
  widths: number[];
  /** Occupants whose own width moved at an unchanged rung. The usual culprit. */
  moved: MovedWidth[];
  /**
   * A placement the episode had already produced came back. That is a genuine
   * cycle in the fit — a different defect from a premise that keeps moving, and
   * the one case where blaming the search is right.
   */
  cycled: boolean;
}

/** The maximum occupants named in one fault. Evidence, not a data dump. */
const MAX_NAMED = 4;

/** One decimal place: enough to show a real move, not enough to show jitter. */
function round1(px: number): number {
  return Math.round(px * 10) / 10;
}

export function summarizeRounds(
  ring: readonly Round[],
  moves: ReadonlyMap<string, MovedWidth>,
  counts: { rounds: number; shifts: number; total: number },
): ConvergenceEvidence {
  // Rounded BEFORE the comparison, not after: comparing a raw width against an
  // already-rounded neighbour makes every fractional rect look like a new width
  // and turns "the row held still" into a list of six identical numbers.
  const widths: number[] = [];
  for (const round of ring) {
    const px = round1(round.available);
    if (widths[widths.length - 1] !== px) widths.push(px);
  }
  const decided = ring
    .map((r) => r.decided)
    .filter((d): d is string => d !== undefined);
  return {
    rounds: counts.rounds,
    shifts: counts.shifts,
    total: counts.total,
    widths,
    moved: [...moves.values()].slice(0, MAX_NAMED).map((m) => ({
      id: m.id,
      rung: m.rung,
      from: round1(m.from),
      to: round1(m.to),
    })),
    cycled: new Set(decided).size < decided.length,
  };
}

/**
 * The evidence as one sentence, for the fault message and the report row.
 *
 * Written as a finding rather than a dump: the reader wants "which occupant
 * moved, and did the row hold still while it did", and that is a claim, not a
 * table.
 */
export function describeEvidence(evidence: ConvergenceEvidence): string {
  const parts: string[] = [];
  parts.push(
    evidence.widths.length > 1
      ? `The row itself moved (${evidence.widths.map((w) => `${String(w)}px`).join(" → ")}).`
      : `The row held ${String(evidence.widths[0] ?? 0)}px throughout.`,
  );
  if (evidence.moved.length > 0) {
    const named = evidence.moved
      .map(
        (m) =>
          `"${m.id}" measured ${String(m.from)}px then ${String(m.to)}px at rung ${String(m.rung)}`,
      )
      .join("; ");
    parts.push(
      `${named} — that occupant's own rendered width moved between rounds, so the fit was deciding from numbers that had already changed.`,
    );
  } else if (evidence.cycled) {
    parts.push(
      `No occupant's width moved and a placement the search had already produced came back, so this is a cycle in the fit itself rather than a moving premise.`,
    );
  } else {
    parts.push(
      `No occupant's width moved at an unchanged rung, so the search simply needed more rounds than its budget allowed.`,
    );
  }
  return parts.join(" ");
}
