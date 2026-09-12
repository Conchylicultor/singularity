import { describe, expect, it } from "bun:test";
import { runsWithoutSpan } from "./runs-without-span";

// The text an `Editor.InsertAction` is handed: the caret line with the menu's
// query span cut out, in the same linear basis the content-doc strip uses.

describe("runsWithoutSpan", () => {
  it("cuts a trailing `/query`, keeping the words before it", () => {
    expect(runsWithoutSpan([{ text: "notes /agent-page" }], 6, 17)).toEqual([
      { text: "notes " },
    ]);
  });

  it("joins the text on both sides of a mid-line query", () => {
    expect(runsWithoutSpan([{ text: "a /x b" }], 2, 4)).toEqual([
      { text: "a  b" },
    ]);
  });

  it("keeps marks on both sides of the cut", () => {
    expect(
      runsWithoutSpan(
        [{ text: "bold", marks: ["bold"] }, { text: " /q" }],
        4,
        7,
      ),
    ).toEqual([{ text: "bold", marks: ["bold"] }]);
  });

  it("cuts nothing for an empty span, and everything for a whole-line one", () => {
    const runs = [{ text: "keep" }];
    expect(runsWithoutSpan(runs, 2, 2)).toEqual(runs);
    expect(runsWithoutSpan([{ text: "/agent-page" }], 0, 11)).toEqual([]);
  });
});
