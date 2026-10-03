import { describe, expect, it } from "bun:test";
import { lookupExhibit } from "./lookup";

const def = (id: string, label = id) => ({ id, label });

describe("lookupExhibit", () => {
  it("finds the one exhibit with that id", () => {
    const a = def("a/x");
    expect(lookupExhibit([a, def("b/y")], "a/x")).toEqual({
      kind: "found",
      exhibit: a,
    });
  });

  it("reports a missing id", () => {
    expect(lookupExhibit([def("a/x")], "nope/z")).toEqual({ kind: "missing" });
  });

  it("reports two claims on one id instead of picking one", () => {
    const one = def("a/x", "one");
    const two = def("a/x", "two");
    expect(lookupExhibit([one, two], "a/x")).toEqual({
      kind: "ambiguous",
      exhibits: [one, two],
    });
  });
});
