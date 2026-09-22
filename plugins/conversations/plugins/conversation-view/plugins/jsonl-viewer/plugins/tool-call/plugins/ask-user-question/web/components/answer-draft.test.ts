import { describe, expect, test } from "bun:test";
import { answersFromText } from "./answer-draft";
import type { Question } from "./answer-model";
import { ANSWER_MARKER } from "../../shared";

const single: Question = {
  question: "Which approach?",
  header: "Approach",
  multiSelect: false,
  options: [
    { label: "Hook", description: "" },
    { label: "Slot", description: "" },
  ],
};
const multi: Question = {
  question: "Which parts?",
  header: "Parts",
  multiSelect: true,
  options: [
    { label: "Web", description: "" },
    { label: "Server", description: "" },
  ],
};

const text = (...lines: string[]) =>
  `${ANSWER_MARKER}\n\n${lines.map((l) => `- ${l}`).join("\n")}`;

describe("answersFromText", () => {
  test("a picked preset comes back selected", () => {
    expect(answersFromText([single], text("Approach: Slot"))).toEqual([
      { selected: ["Slot"], otherText: "", otherActive: false },
    ]);
  });

  test("a typed single-select answer comes back as the active Other", () => {
    expect(answersFromText([single], text("Approach: something else"))).toEqual(
      [{ selected: [], otherText: "something else", otherActive: true }],
    );
  });

  test("multi-select keeps presets and the additive freeform", () => {
    expect(answersFromText([multi], text("Parts: Web, Server, docs"))).toEqual([
      { selected: ["Web", "Server"], otherText: "docs", otherActive: false },
    ]);
  });

  test("an empty multi-select answer comes back empty", () => {
    expect(
      answersFromText([single, multi], text("Approach: Hook", "Parts: ")),
    ).toEqual([
      { selected: ["Hook"], otherText: "", otherActive: false },
      { selected: [], otherText: "", otherActive: false },
    ]);
  });
});
