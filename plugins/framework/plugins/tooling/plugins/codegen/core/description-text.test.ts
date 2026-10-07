import { describe, expect, test } from "bun:test";
import { capDescription, joinDescriptions } from "./description-text";

describe("joinDescriptions", () => {
  test("drops a part identical to an earlier one", () => {
    expect(joinDescriptions(["Nested tasks.", "Nested tasks."])).toBe(
      "Nested tasks.",
    );
  });

  test("drops repeated sentences but keeps new ones", () => {
    expect(
      joinDescriptions([
        "Toolbar button. Web only.",
        "Toolbar button. Server half.",
      ]),
    ).toBe("Toolbar button. Web only. Server half.");
  });

  test("does not split on abbreviations followed by lowercase", () => {
    expect(joinDescriptions(["Uses e.g. tokens. Done."])).toBe(
      "Uses e.g. tokens. Done.",
    );
  });
});

describe("capDescription", () => {
  test("leaves a short description untouched", () => {
    expect(capDescription("Short.", 20)).toBe("Short.");
  });

  test("cuts at a word boundary and marks the cut", () => {
    const out = capDescription("alpha beta gamma delta epsilon", 20);
    expect(out).toBe("alpha beta gamma…");
    expect(out.length).toBeLessThanOrEqual(20);
  });

  test("strips trailing punctuation before the ellipsis", () => {
    expect(capDescription("alpha beta, gamma delta epsilon", 13)).toBe(
      "alpha beta…",
    );
  });
});
