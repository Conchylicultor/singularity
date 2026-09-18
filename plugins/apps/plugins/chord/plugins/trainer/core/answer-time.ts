// ── How long an answer took ──────────────────────────────────────────────────
//
// The rule (the mockup's): a box's clock starts the first time its chord
// FINISHES sounding in the round — you cannot name a chord before you have
// heard all of it. The answer time runs from then to the click that filled
// the box; if the answer is changed, the last fill counts. The time is then
// clamped to [ANSWER_MS_MIN, ANSWER_MS_MAX]: below, the click was already on
// its way before the chord ended; above, the learner was away, and a 5-minute
// answer would swamp the chord's median.

export const ANSWER_MS_MIN = 300;
export const ANSWER_MS_MAX = 30_000;

/** An answer time clamped to [ANSWER_MS_MIN, ANSWER_MS_MAX]. Throws on a value that is not a number of milliseconds. */
export function clampAnswerMs(ms: number): number {
  if (!Number.isFinite(ms)) {
    throw new Error(
      `An answer time is a finite number of milliseconds, got ${ms}`,
    );
  }
  return Math.min(ANSWER_MS_MAX, Math.max(ANSWER_MS_MIN, ms));
}
