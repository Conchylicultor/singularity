import { describe, expect, test } from "bun:test";
import { answersFromRecord } from "./answer-model";

describe("answersFromRecord", () => {
  test("reads each answer and its note from the structured record", () => {
    expect(
      answersFromRecord({
        answers: { "Which?": "Explain", "Also?": "A, B" },
        annotations: { "Which?": { notes: "why" } },
      }),
    ).toEqual({
      "Which?": { answer: "Explain", notes: "why" },
      "Also?": { answer: "A, B", notes: null },
    });
  });

  test("the no-selection sentinel reads as no answer, keeping the note", () => {
    expect(
      answersFromRecord({
        answers: { "Which?": "(no option selected)" },
        annotations: { "Which?": { notes: "only a note" } },
      }),
    ).toEqual({ "Which?": { answer: null, notes: "only a note" } });
  });
});
