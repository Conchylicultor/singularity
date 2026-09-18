import { describe, expect, it } from "bun:test";
import { ANSWER_MS_MAX, ANSWER_MS_MIN, clampAnswerMs } from "./answer-time";

describe("clampAnswerMs", () => {
  it("keeps a time inside the range", () => {
    expect(clampAnswerMs(1400)).toBe(1400);
    expect(clampAnswerMs(ANSWER_MS_MIN)).toBe(300);
    expect(clampAnswerMs(ANSWER_MS_MAX)).toBe(30_000);
  });

  it("raises a click that beat the chord's end to the minimum", () => {
    expect(clampAnswerMs(120)).toBe(300);
    expect(clampAnswerMs(-500)).toBe(300);
  });

  it("caps a learner who was away at the maximum", () => {
    expect(clampAnswerMs(300_000)).toBe(30_000);
  });

  it("refuses a value that is not a time", () => {
    expect(() => clampAnswerMs(Number.NaN)).toThrow("finite");
    expect(() => clampAnswerMs(Number.POSITIVE_INFINITY)).toThrow("finite");
  });
});
