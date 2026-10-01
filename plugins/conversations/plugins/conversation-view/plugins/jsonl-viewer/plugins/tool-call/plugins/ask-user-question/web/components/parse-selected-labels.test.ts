import { describe, expect, test } from "bun:test";
import { parseSelectedLabels, type QuestionOption } from "./answer-model";

const options: QuestionOption[] = [
  { label: "Flush main area", description: "" },
  { label: "46px toolbar, no border", description: "" },
  { label: "Thin-stroke icons", description: "" },
];

describe("parseSelectedLabels", () => {
  test("a label containing the separator is matched whole, not leaked into free-form", () => {
    const r = parseSelectedLabels(
      "Flush main area, 46px toolbar, no border, Keep the original mockup. Add the unticked changes",
      options,
    );
    expect([...r.selected]).toEqual([
      "Flush main area",
      "46px toolbar, no border",
    ]);
    expect(r.otherText).toBe(
      "Keep the original mockup. Add the unticked changes",
    );
  });

  test("free-form text with commas is kept verbatim", () => {
    const r = parseSelectedLabels("Thin-stroke icons, a, b, c", options);
    expect([...r.selected]).toEqual(["Thin-stroke icons"]);
    expect(r.otherText).toBe("a, b, c");
  });

  test("a label prefix that does not end on a boundary is not a match", () => {
    const r = parseSelectedLabels("Flush main areas", options);
    expect(r.selected.size).toBe(0);
    expect(r.otherText).toBe("Flush main areas");
  });

  test("only labels", () => {
    const r = parseSelectedLabels(
      "46px toolbar, no border, Thin-stroke icons",
      options,
    );
    expect([...r.selected]).toEqual([
      "46px toolbar, no border",
      "Thin-stroke icons",
    ]);
    expect(r.otherText).toBeNull();
  });
});
