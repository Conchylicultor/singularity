// ── The mastery rule: when does the learner know a chord? ────────────────────
//
// Stated once, here, and used by both the server (the `chord.progress` loader)
// and the panel. The mockup's rule: the last 20 answers for the chord all
// exist, at least 90 % of them are right, and their median answer time is at
// most 2 s.

/** How many of a chord's most recent answers the rule looks at. */
export const MASTERY_WINDOW = 20;
/** The share of the window that must be right. */
export const TARGET_ACCURACY = 0.9;
/** The median answer time, in ms, the window must not exceed. */
export const TARGET_MEDIAN_MS = 2000;

/** One answer given for a chord: whether it was right, and how long it took. */
export type ChordAnswerSample = { correct: boolean; answerMs: number };

/** How a chord stands over its last `MASTERY_WINDOW` answers. */
export type ChordMastery = {
  /** Answers looked at: `min(recent.length, MASTERY_WINDOW)`. */
  answers: number;
  /** How many of those were right. */
  correct: number;
  /** `correct / answers`, or null when there are no answers yet. */
  accuracy: number | null;
  /** The median answer time of the window (the mean of the two middle ones for an even count), or null when there are no answers yet. */
  medianMs: number | null;
  /** A full window, at least `TARGET_ACCURACY` right, median at most `TARGET_MEDIAN_MS`. */
  mastered: boolean;
};

/**
 * How a chord stands, from its answers **most recent first**. Only the first
 * `MASTERY_WINDOW` entries are read, so a caller may pass a longer history;
 * passing it oldest-first would judge the chord on its oldest answers instead.
 */
export function chordMastery(
  recent: readonly ChordAnswerSample[],
): ChordMastery {
  const window = recent.slice(0, MASTERY_WINDOW);
  const answers = window.length;
  const correct = window.filter((a) => a.correct).length;
  if (answers === 0) {
    return {
      answers,
      correct,
      accuracy: null,
      medianMs: null,
      mastered: false,
    };
  }
  const accuracy = correct / answers;
  const medianMs = median(window.map((a) => a.answerMs));
  return {
    answers,
    correct,
    accuracy,
    medianMs,
    mastered:
      answers >= MASTERY_WINDOW &&
      accuracy >= TARGET_ACCURACY &&
      medianMs <= TARGET_MEDIAN_MS,
  };
}

/** The median of a non-empty list. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) {
    throw new Error("median of an empty list");
  }
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  if (lower === undefined) {
    throw new Error("median: an even-length list with no lower middle");
  }
  return (lower + upper) / 2;
}
