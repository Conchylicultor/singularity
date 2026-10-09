import { describe, expect, test } from "bun:test";
import { closestTagNames } from "./suggest";

const VOCAB = ["In progress", "Planned", "Done", "Parked"];

describe("closestTagNames", () => {
  test("a near-miss spelling finds its tag", () => {
    expect(closestTagNames("Plannd", VOCAB)).toEqual(["Planned"]);
  });

  test("containment finds a tag a word of it names", () => {
    expect(closestTagNames("progress", VOCAB)[0]).toBe("In progress");
  });

  test("case and spacing do not count", () => {
    expect(closestTagNames("  IN   PROGRESS ", VOCAB)[0]).toBe("In progress");
  });

  test("an unrelated name gets no suggestion", () => {
    expect(closestTagNames("Blocked", VOCAB)).toEqual([]);
  });

  test("at most `limit` names, best first", () => {
    const many = ["Bug", "Bugs", "Bugfix", "Bugged"];
    expect(closestTagNames("bug", many, 2)).toHaveLength(2);
  });
});
