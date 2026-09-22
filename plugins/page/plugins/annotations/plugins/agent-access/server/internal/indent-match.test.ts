import { describe, expect, test } from "bun:test";
import { findEdits, type FindEditsResult } from "./indent-match";

/** Apply every edit, last first — what `edit_page` does with `replace_all`. */
function applyAll(markdown: string, result: FindEditsResult): string {
  if (result.kind !== "edits") throw new Error(`no edits: ${result.kind}`);
  let out = markdown;
  for (const e of [...result.edits].reverse()) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

function shifts(result: FindEditsResult) {
  if (result.kind !== "edits") throw new Error(`no edits: ${result.kind}`);
  return result.edits.map((e) =>
    e.shift === null ? null : [e.shift.from.length, e.shift.to.length],
  );
}

const page = [
  "* Parent",
  "  * Child",
  "    * This is fishy. Why is it the case ?",
  "  * Other",
  "",
].join("\n");

describe("findEdits", () => {
  test("an exact match wins and reports no shift", () => {
    const r = findEdits(page, "  * Other", "  * Renamed");
    expect(shifts(r)).toEqual([null]);
    expect(applyAll(page, r)).toContain("\n  * Renamed\n");
  });

  test("a line copied with extra indentation matches a block read at depth zero", () => {
    // The case that started this: copied from a whole-page read, edited through
    // the id of the card around it, whose read starts at depth zero.
    const scoped = "* This is fishy. Why is it the case ?\n";
    const r = findEdits(
      scoped,
      "    * This is fishy. Why is it the case ?",
      "    * This is fishy. Why is it the case ?\n      <agent-inline>\n        Answer.\n      </agent-inline>",
    );
    expect(shifts(r)).toEqual([[4, 0]]);
    expect(applyAll(scoped, r)).toBe(
      "* This is fishy. Why is it the case ?\n  <agent-inline>\n    Answer.\n  </agent-inline>\n",
    );
  });

  test("a line copied without its indentation matches the nested line", () => {
    const r = findEdits(
      page,
      "* This is fishy. Why is it the case ?",
      "* Fixed.",
    );
    // `* This is fishy…` is an exact substring of the indented line, so it
    // matches exactly — mid-line, keeping the leading spaces around it.
    expect(shifts(r)).toEqual([null]);
    expect(applyAll(page, r)).toContain("\n    * Fixed.\n");
  });

  test("a multi-line snippet shifted deeper keeps its line-to-line indentation", () => {
    const r = findEdits(
      page,
      "* Child\n  * This is fishy. Why is it the case ?",
      "* Child\n  * Answered.",
    );
    expect(shifts(r)).toEqual([[0, 2]]);
    expect(applyAll(page, r)).toBe(
      "* Parent\n  * Child\n    * Answered.\n  * Other\n",
    );
  });

  test("a different indentation between lines does not match", () => {
    const r = findEdits(
      page,
      "* Child\n      * This is fishy. Why is it the case ?",
      "x",
    );
    expect(r.kind).toBe("none");
  });

  test("blank lines inside the snippet match any whitespace-only line", () => {
    const md = "* A\n  para one\n  \n  para two\n";
    const r = findEdits(md, "para one\n\npara two", "para one\n\npara 2");
    expect(shifts(r)).toEqual([[0, 2]]);
    expect(applyAll(md, r)).toBe("* A\n  para one\n\n  para 2\n");
  });

  test("the same text at two depths is two matches, each with its depth", () => {
    const r3 = findEdits(
      "* a\n  * b\n    * a\n      * b\n",
      " * a\n   * b",
      " * a\n   * c",
    );
    expect(shifts(r3)).toEqual([
      [1, 0],
      [1, 4],
    ]);
    expect(applyAll("* a\n  * b\n    * a\n      * b\n", r3)).toBe(
      "* a\n  * c\n    * a\n      * c\n",
    );
  });

  test("a line of new_string less indented than the snippet is refused", () => {
    const r = findEdits(
      page,
      "    * Child\n      * This",
      "    * Child\n* Escaped",
    );
    expect(r).toEqual({ kind: "new-string-shallower", line: "* Escaped" });
  });

  test("a match can end mid-line", () => {
    const r = findEdits(
      page,
      "* Child\n  * This is fishy",
      "* Child\n  * This is odd",
    );
    expect(shifts(r)).toEqual([[0, 2]]);
    expect(applyAll(page, r)).toContain(
      "\n    * This is odd. Why is it the case ?\n",
    );
  });

  test("a snippet ending in a line break ends at the next line's start", () => {
    const r = findEdits(page, "    * Other\n", "    * Other\n    * Added\n");
    expect(shifts(r)).toEqual([[4, 2]]);
    expect(applyAll(page, r)).toBe(
      "* Parent\n  * Child\n    * This is fishy. Why is it the case ?\n  * Other\n  * Added\n",
    );
  });

  test("tabs mixed with spaces have no common indentation to shift by", () => {
    const r = findEdits(page, "\t* Child\n  * This", "x");
    expect(r.kind).toBe("none");
  });

  test("a line-start shift never matches mid-line", () => {
    const r = findEdits("* see: * Child\n", "  * Child", "x");
    expect(r.kind).toBe("none");
  });
});
