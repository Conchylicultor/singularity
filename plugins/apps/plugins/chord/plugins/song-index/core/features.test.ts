import { describe, expect, it } from "bun:test";
import { chordFeatures, type ChordFeature } from "./features";

const plain: Parameters<typeof chordFeatures>[0] = {
  type: 5,
  inversion: 0,
  applied: 0,
  borrowed: null,
  suspensions: [],
  alterations: [],
  adds: [],
  omits: [],
};

describe("chordFeatures", () => {
  it("finds nothing on a plain root-position triad", () => {
    expect(chordFeatures(plain)).toEqual([]);
    expect(chordFeatures({ ...plain, borrowed: "" })).toEqual([]);
  });

  it.each<[Partial<Parameters<typeof chordFeatures>[0]>, ChordFeature[]]>([
    [{ type: 7 }, ["seventh"]],
    [{ type: 9 }, ["extended"]],
    [{ type: 13 }, ["extended"]],
    [{ inversion: 2 }, ["inverted"]],
    [{ applied: 5 }, ["applied"]],
    [{ borrowed: "minor" }, ["borrowed"]],
    [{ borrowed: [0, 2, 3, 5, 7, 8, 10] }, ["borrowed"]],
    [{ suspensions: [4] }, ["suspended"]],
    [{ alterations: ["b9"] }, ["altered"]],
    [{ adds: [9] }, ["added"]],
    [{ omits: [3] }, ["omitted"]],
  ])("reads %p as %p", (fields, features) => {
    expect(chordFeatures({ ...plain, ...fields })).toEqual(features);
  });

  it("lists several features in the closed list's order", () => {
    // V7/V in first inversion, borrowed, with a b9.
    expect(
      chordFeatures({
        ...plain,
        omits: [5],
        type: 7,
        applied: 5,
        inversion: 1,
        alterations: ["b9"],
        borrowed: "dorian",
      }),
    ).toEqual([
      "seventh",
      "inverted",
      "applied",
      "borrowed",
      "altered",
      "omitted",
    ]);
  });
});
