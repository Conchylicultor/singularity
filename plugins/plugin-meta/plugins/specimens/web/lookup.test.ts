import { describe, expect, it } from "bun:test";
import { lookupSpecimen } from "./lookup";
import type { SpecimenInfo } from "./types";

const def = (id: string, label = id): SpecimenInfo => ({ id, label });

describe("lookupSpecimen", () => {
  it("finds the one specimen with that id", () => {
    const a = def("a/x");
    expect(lookupSpecimen([a, def("b/y")], "a/x")).toEqual({
      kind: "found",
      specimen: a,
    });
  });

  it("reports a missing id", () => {
    expect(lookupSpecimen([def("a/x")], "nope/z")).toEqual({ kind: "missing" });
  });

  it("reports two claims on one id instead of picking one", () => {
    const one = def("a/x", "one");
    const two = def("a/x", "two");
    expect(lookupSpecimen([one, two], "a/x")).toEqual({
      kind: "ambiguous",
      specimens: [one, two],
    });
  });
});
