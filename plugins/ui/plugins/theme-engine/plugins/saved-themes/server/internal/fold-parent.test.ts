import { describe, it, expect } from "bun:test";

import {
  defineTheme,
  defineTokenGroup,
  resolveTheme,
  type Theme,
} from "@plugins/ui/plugins/theme-engine/core";
import { foldParentInto } from "./fold-parent";

const palette = defineTokenGroup("palette", {
  primary: { default: "blue" },
  background: { default: "white" },
});
const shape = defineTokenGroup("shape", { radius: { default: "0.5rem" } });
const groups = [palette, shape];

const root = defineTheme({
  id: "root",
  label: "Root",
  fragments: [palette.fragment({ light: { background: "ivory" }, dark: {} })],
  colorAdjust: { hueShift: 10, saturationScale: 1, lightnessScale: 1 },
});
const parent: Theme = {
  id: "tweakcn:parent",
  label: "Parent",
  source: "tweakcn",
  extends: "root",
  fragments: [
    palette.fragment({
      light: { primary: "red" },
      dark: { primary: "maroon" },
    }),
    {
      ...shape.fragment({ light: { radius: "0" }, dark: { radius: "0" } }),
      meta: { tier: 1 },
    },
  ],
};
const child: Theme = {
  id: "custom:child",
  label: "Child",
  source: "custom",
  extends: "tweakcn:parent",
  fragments: [
    palette.fragment({ light: { primary: "green", background: "" }, dark: {} }),
  ],
};

describe("foldParentInto", () => {
  it("leaves the child resolving to exactly what it painted before", () => {
    const before = resolveTheme(
      child.id,
      new Map([root, parent, child].map((t) => [t.id, t])),
      groups,
    );
    const folded: Theme = { ...child, ...foldParentInto(parent, child) };
    const after = resolveTheme(
      child.id,
      new Map([root, folded].map((t) => [t.id, t])),
      groups,
    );
    expect(after).toEqual(before);
  });

  it("re-points the child at the parent's parent and keeps the parent's meta where the child has none", () => {
    const folded = foldParentInto(parent, child);
    expect(folded.extends).toBe("root");
    expect(folded.fragments.find((f) => f.groupId === "shape")?.meta).toEqual({
      tier: 1,
    });
    // The empty value the child held adds nothing: the parent's (absent) value stands.
    expect(
      folded.fragments.find((f) => f.groupId === "palette")?.light,
    ).toEqual({
      primary: "green",
    });
  });

  it("keeps the child's own colorAdjust over the parent's", () => {
    const tinted = {
      ...child,
      colorAdjust: { hueShift: 90, saturationScale: 1, lightnessScale: 1 },
    };
    const withParentAdjust = {
      ...parent,
      colorAdjust: { hueShift: 5, saturationScale: 1, lightnessScale: 1 },
    };
    expect(foldParentInto(withParentAdjust, tinted).colorAdjust?.hueShift).toBe(
      90,
    );
    expect(foldParentInto(withParentAdjust, child).colorAdjust?.hueShift).toBe(
      5,
    );
  });
});
