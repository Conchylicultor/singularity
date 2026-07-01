import { describe, expect, test } from "bun:test";
import { decomposeDuration } from "./durations";

describe("decomposeDuration — sub-sixteenth vocabulary", () => {
  test("a 32nd is one piece", () => {
    expect(decomposeDuration(0.125)).toEqual([
      { duration: "32", dots: 0, beats: 0.125 },
    ]);
  });

  test("a dotted 16th is a single dotted-sixteenth piece (unchanged)", () => {
    expect(decomposeDuration(0.375)).toEqual([
      { duration: "16", dots: 1, beats: 0.375 },
    ]);
  });

  test("a dotted 32nd is a single dotted-thirty-second piece", () => {
    expect(decomposeDuration(0.1875)).toEqual([
      { duration: "32", dots: 1, beats: 0.1875 },
    ]);
  });

  test("1.125 beats is a quarter tied to a 32nd", () => {
    expect(decomposeDuration(1.125)).toEqual([
      { duration: "q", dots: 0, beats: 1 },
      { duration: "32", dots: 0, beats: 0.125 },
    ]);
  });
});
