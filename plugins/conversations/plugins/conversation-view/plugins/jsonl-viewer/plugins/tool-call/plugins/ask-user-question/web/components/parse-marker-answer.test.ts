import { describe, expect, it } from "bun:test";
import { ANSWER_MARKER } from "../../shared";
import { parseMarkerAnswer, type Question } from "./answer-model";

function q(partial: Partial<Question> & { header: string }): Question {
  return {
    question: partial.question ?? `${partial.header}?`,
    header: partial.header,
    options: partial.options ?? [],
    multiSelect: partial.multiSelect ?? false,
  };
}

describe("parseMarkerAnswer", () => {
  it("parses headers that contain ': ' without mis-splitting the value", () => {
    const questions = [
      q({ header: "Scope: CLI fix", question: "Fix the CLI trigger?" }),
      q({ header: "Scope: kill hardening", question: "Harden the kill path?" }),
    ];
    const text = `${ANSWER_MARKER}\n\n- Scope: CLI fix: Both (Recommended)\n- Scope: kill hardening: Include (Recommended)`;

    const answers = parseMarkerAnswer(text, questions);

    expect(answers["Fix the CLI trigger?"]?.answer).toBe("Both (Recommended)");
    expect(answers["Harden the kill path?"]?.answer).toBe("Include (Recommended)");
  });

  it("parses simple single-colon headers", () => {
    const questions = [q({ header: "Library", question: "Which library?" })];
    const text = `${ANSWER_MARKER}\n\n- Library: date-fns`;

    const answers = parseMarkerAnswer(text, questions);

    expect(answers["Which library?"]?.answer).toBe("date-fns");
  });

  it("treats an empty value (e.g. multi-select with no choices) as null", () => {
    const questions = [q({ header: "Features", multiSelect: true })];
    const text = `${ANSWER_MARKER}\n\n- Features: `;

    const answers = parseMarkerAnswer(text, questions);

    expect(answers["Features?"]?.answer).toBeNull();
  });

  it("distinguishes two questions sharing the same header by position", () => {
    const questions = [
      q({ header: "Scope", question: "Q1" }),
      q({ header: "Scope", question: "Q2" }),
    ];
    const text = `${ANSWER_MARKER}\n\n- Scope: first\n- Scope: second`;

    const answers = parseMarkerAnswer(text, questions);

    expect(answers["Q1"]?.answer).toBe("first");
    expect(answers["Q2"]?.answer).toBe("second");
  });
});
