import { describe, expect, test } from "bun:test";
import {
  MASTERY_WINDOW,
  TARGET_MEDIAN_MS,
  chordMastery,
  type ChordAnswerSample,
} from "./mastery";

const right = (answerMs = 1000): ChordAnswerSample => ({
  correct: true,
  answerMs,
});
const wrong = (answerMs = 1000): ChordAnswerSample => ({
  correct: false,
  answerMs,
});
const times = (n: number, a: ChordAnswerSample) =>
  Array.from({ length: n }, () => a);

describe("chordMastery", () => {
  test("no answers: nothing to measure, not mastered", () => {
    expect(chordMastery([])).toEqual({
      answers: 0,
      correct: 0,
      accuracy: null,
      medianMs: null,
      mastered: false,
    });
  });

  test("a full window, all right and fast: mastered", () => {
    const m = chordMastery(times(MASTERY_WINDOW, right(900)));
    expect(m).toEqual({
      answers: 20,
      correct: 20,
      accuracy: 1,
      medianMs: 900,
      mastered: true,
    });
  });

  test("fewer than the window is never mastered, however good", () => {
    const m = chordMastery(times(MASTERY_WINDOW - 1, right(500)));
    expect(m.answers).toBe(19);
    expect(m.accuracy).toBe(1);
    expect(m.mastered).toBe(false);
  });

  test("only the first MASTERY_WINDOW (the most recent) are read", () => {
    // 20 recent right answers, then 10 older wrong and slow ones.
    const m = chordMastery([
      ...times(MASTERY_WINDOW, right(1000)),
      ...times(10, wrong(9000)),
    ]);
    expect(m.answers).toBe(20);
    expect(m.correct).toBe(20);
    expect(m.mastered).toBe(true);
    // Oldest-first would have judged the wrong ones.
    const reversed = chordMastery([
      ...times(10, wrong(9000)),
      ...times(MASTERY_WINDOW, right(1000)),
    ]);
    expect(reversed.correct).toBe(10);
    expect(reversed.mastered).toBe(false);
  });

  test("accuracy threshold: 18 of 20 (90 %) passes, 17 of 20 fails", () => {
    const at90 = chordMastery([...times(18, right()), ...times(2, wrong())]);
    expect(at90.accuracy).toBe(0.9);
    expect(at90.mastered).toBe(true);
    const at85 = chordMastery([...times(17, right()), ...times(3, wrong())]);
    expect(at85.accuracy).toBe(0.85);
    expect(at85.mastered).toBe(false);
  });

  test("median threshold: exactly the target passes, just above fails", () => {
    const atTarget = chordMastery(times(20, right(TARGET_MEDIAN_MS)));
    expect(atTarget.medianMs).toBe(TARGET_MEDIAN_MS);
    expect(atTarget.mastered).toBe(true);
    const slow = chordMastery(times(20, right(TARGET_MEDIAN_MS + 1)));
    expect(slow.mastered).toBe(false);
  });

  test("median of an even count is the mean of the two middle times", () => {
    // 10 at 1000 ms and 10 at 3000 ms: the middle two are 1000 and 3000.
    const m = chordMastery([
      ...times(10, right(3000)),
      ...times(10, right(1000)),
    ]);
    expect(m.medianMs).toBe(2000);
    expect(m.mastered).toBe(true);
  });

  test("median of an odd count is the middle time, whatever the input order", () => {
    const m = chordMastery([right(5000), right(300), right(1200)]);
    expect(m.medianMs).toBe(1200);
  });

  test("a few very slow answers do not move the median", () => {
    const m = chordMastery([
      ...times(3, right(30_000)),
      ...times(17, right(800)),
    ]);
    expect(m.medianMs).toBe(800);
    expect(m.mastered).toBe(true);
  });
});
