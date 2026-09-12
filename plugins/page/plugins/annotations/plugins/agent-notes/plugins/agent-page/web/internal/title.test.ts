import { describe, expect, it } from "bun:test";
import { agentPageTitle } from "./title";

describe("agentPageTitle", () => {
  it("keeps the line's other words, so nothing the user typed disappears", () => {
    // `notes /agent-page` with the query cut out: the space before `/` stays.
    expect(agentPageTitle([{ text: "notes " }])).toBe("notes");
  });

  it("reads through marks — a title is plain text", () => {
    expect(
      agentPageTitle([{ text: "Find" }, { text: "ings", marks: ["bold"] }]),
    ).toBe("Findings");
  });

  it("gives an otherwise-empty line an untitled page", () => {
    expect(agentPageTitle([])).toBe("");
    expect(agentPageTitle([{ text: "  " }])).toBe("");
  });
});
