import { describe, it, expect } from "bun:test";

import { applyFragmentEdit } from "./fragment-edit";
import type { SavedTheme } from "./saved-theme";

const fragments: SavedTheme["fragments"] = [
  {
    groupId: "palette",
    light: { primary: "red", ring: "gray" },
    dark: { primary: "maroon" },
  },
  {
    groupId: "shape",
    light: { radius: "0" },
    dark: { radius: "0" },
    meta: { tier: 1 },
  },
];

describe("applyFragmentEdit", () => {
  it("merge writes the given tokens and keeps the rest", () => {
    const next = applyFragmentEdit(fragments, {
      groupId: "palette",
      mode: "merge",
      light: { primary: "green" },
      dark: {},
    });
    expect(next[0]).toEqual({
      groupId: "palette",
      light: { primary: "green", ring: "gray" },
      dark: { primary: "maroon" },
    });
    expect(next[1]).toEqual(fragments[1]!);
  });

  it("merge with an empty value removes the token, so the inherited value shows again", () => {
    const next = applyFragmentEdit(fragments, {
      groupId: "palette",
      mode: "merge",
      light: { ring: "" },
      dark: {},
    });
    expect(next[0]!.light).toEqual({ primary: "red" });
  });

  it("replace sets the fragment to exactly the given values and meta", () => {
    const next = applyFragmentEdit(fragments, {
      groupId: "shape",
      mode: "replace",
      light: { radius: "1rem" },
      dark: { radius: "1rem" },
    });
    expect(next[1]).toEqual({
      groupId: "shape",
      light: { radius: "1rem" },
      dark: { radius: "1rem" },
    });
  });

  it("adds a fragment for a group the theme did not mention", () => {
    const next = applyFragmentEdit([], {
      groupId: "density",
      mode: "merge",
      light: { padCard: "2rem" },
      dark: {},
      meta: { preset: "cozy" },
    });
    expect(next).toEqual([
      {
        groupId: "density",
        light: { padCard: "2rem" },
        dark: {},
        meta: { preset: "cozy" },
      },
    ]);
  });

  it("drops a fragment left with no tokens and no meta", () => {
    const next = applyFragmentEdit(fragments, {
      groupId: "palette",
      mode: "merge",
      light: { primary: "", ring: "" },
      dark: { primary: "" },
    });
    expect(next.map((f) => f.groupId)).toEqual(["shape"]);
  });
});
