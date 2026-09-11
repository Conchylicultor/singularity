import { describe, it, expect } from "bun:test";

import { both, defineTokenGroup } from "./define-token-group";
import { resolveTheme } from "./resolve-theme";
import { defineTheme, type Theme } from "./theme";

const palette = defineTokenGroup("palette", {
  primary: { default: "blue" },
  background: { default: "white" },
});
const shape = defineTokenGroup("shape", {
  radius: { default: "0.5rem" },
});
const groups = [palette, shape];

function themes(...list: Theme[]): Map<string, Theme> {
  return new Map(list.map((t) => [t.id, t]));
}

function custom(
  id: string,
  rest: Partial<Omit<Theme, "id" | "source">> = {},
): Theme {
  return { id, label: id, source: "custom", fragments: [], ...rest };
}

const base = defineTheme({
  id: "base",
  label: "Base",
  fragments: [
    palette.fragment({
      light: { primary: "red" },
      dark: { primary: "maroon", background: "black" },
    }),
  ],
});

describe("resolveTheme", () => {
  it("gives a group the theme never mentions its schema defaults", () => {
    const { theme } = resolveTheme("base", themes(base), groups);
    expect(theme.groups.shape).toEqual({
      light: { radius: "0.5rem" },
      dark: { radius: "0.5rem" },
    });
    // …and fills the holes of a group it does mention.
    expect(theme.groups.palette!.light).toEqual({
      primary: "red",
      background: "white",
    });
  });

  it("paints an unmentioned group's dark-mode defaults in dark mode", () => {
    const moded = defineTokenGroup("moded", {
      surface: { default: "white", darkDefault: "black" },
    });
    const empty = defineTheme({ id: "empty", label: "Empty", fragments: [] });
    const { theme } = resolveTheme("empty", themes(empty), [moded]);
    expect(theme.groups.moded).toEqual({
      light: { surface: "white" },
      dark: { surface: "black" },
    });
  });

  it("lets a leaf theme beat its extends parent, and inherits what the leaf leaves out", () => {
    const leaf = custom("custom:leaf", {
      extends: "base",
      fragments: [palette.fragment({ light: { primary: "green" }, dark: {} })],
    });
    const { theme } = resolveTheme("custom:leaf", themes(base, leaf), groups);
    expect(theme.groups.palette!.light.primary).toBe("green");
    expect(theme.groups.palette!.dark).toEqual({
      primary: "maroon",
      background: "black",
    });
  });

  it("does not let an empty value override an inherited one", () => {
    const leaf = custom("custom:leaf", {
      extends: "base",
      fragments: [palette.fragment({ light: { primary: "" }, dark: {} })],
    });
    const { theme } = resolveTheme("custom:leaf", themes(base, leaf), groups);
    expect(theme.groups.palette!.light.primary).toBe("red");
  });

  it("throws on an extends cycle", () => {
    const a = custom("custom:a", { extends: "custom:b" });
    const b = custom("custom:b", { extends: "custom:a" });
    expect(() => resolveTheme("custom:a", themes(a, b), groups)).toThrow(
      /extends cycle/,
    );
    const self = custom("custom:self", { extends: "custom:self" });
    expect(() => resolveTheme("custom:self", themes(self), groups)).toThrow(
      /extends cycle/,
    );
  });

  it("throws on a missing extends target, and on an unknown theme", () => {
    const orphan = custom("custom:orphan", { extends: "gone" });
    expect(() => resolveTheme("custom:orphan", themes(orphan), groups)).toThrow(
      /extends "gone"/,
    );
    expect(() => resolveTheme("nope", themes(base), groups)).toThrow(
      /"nope" is not a registered theme/,
    );
  });

  it("takes colorAdjust from the leaf, else the nearest ancestor, else neutral", () => {
    const tinted = custom("custom:tinted", {
      extends: "base",
      colorAdjust: { hueShift: 30, saturationScale: 1, lightnessScale: 1 },
    });
    const child = custom("custom:child", { extends: "custom:tinted" });
    const own = custom("custom:own", {
      extends: "custom:tinted",
      colorAdjust: { hueShift: 0, saturationScale: 0, lightnessScale: 1 },
    });
    const all = themes(base, tinted, child, own);

    expect(resolveTheme("base", all, groups).theme.colorAdjust).toEqual({
      hueShift: 0,
      saturationScale: 1,
      lightnessScale: 1,
    });
    expect(
      resolveTheme("custom:child", all, groups).theme.colorAdjust.hueShift,
    ).toBe(30);
    expect(resolveTheme("custom:own", all, groups).theme.colorAdjust).toEqual({
      hueShift: 0,
      saturationScale: 0,
      lightnessScale: 1,
    });
  });

  it("skips and reports a fragment for an unregistered group", () => {
    const stale = custom("custom:stale", {
      fragments: [
        { groupId: "retired", light: { x: "1" }, dark: {} },
        shape.fragment(both({ radius: "0" })),
      ],
    });
    const { theme, skipped } = resolveTheme(
      "custom:stale",
      themes(stale),
      groups,
    );
    expect(skipped).toEqual([
      {
        reason: "unregistered-group",
        themeId: "custom:stale",
        groupId: "retired",
      },
    ]);
    expect(Object.keys(theme.groups).sort()).toEqual(["palette", "shape"]);
    expect(theme.groups.shape!.dark.radius).toBe("0");
  });

  it("drops and reports token keys the group's schema does not declare", () => {
    const stale = custom("custom:stale", {
      fragments: [
        {
          groupId: "palette",
          light: { primary: "pink", renamed: "x" },
          dark: { renamed: "y", toString: "z" },
        },
      ],
    });
    const { theme, skipped } = resolveTheme(
      "custom:stale",
      themes(stale),
      groups,
    );
    expect(skipped).toEqual([
      {
        reason: "unknown-tokens",
        themeId: "custom:stale",
        groupId: "palette",
        tokens: ["renamed", "toString"],
      },
    ]);
    expect(theme.groups.palette!.light).toEqual({
      primary: "pink",
      background: "white",
    });
    expect(theme.groups.palette!.dark).toEqual({
      primary: "blue",
      background: "white",
    });
  });
});

describe("defineTheme", () => {
  it("reserves ':' ids for saved themes", () => {
    expect(() =>
      defineTheme({ id: "custom:x", label: "X", fragments: [] }),
    ).toThrow(/reserved for saved themes/);
  });

  it("rejects two fragments for one group", () => {
    expect(() =>
      defineTheme({
        id: "twice",
        label: "Twice",
        fragments: [
          shape.fragment(both({ radius: "0" })),
          shape.fragment(both({ radius: "1rem" })),
        ],
      }),
    ).toThrow(/two fragments for token group "shape"/);
  });
});

describe("TokenGroupDescriptor.fragment", () => {
  it("is typed against the group's schema", () => {
    const fragment = palette.fragment({
      light: { primary: "red" },
      dark: {},
      meta: { note: 1 },
    });
    expect(fragment).toEqual({
      groupId: "palette",
      light: { primary: "red" },
      dark: {},
      meta: { note: 1 },
    });
    // A token the group does not declare does not compile — in a literal…
    // @ts-expect-error — `primry` is not a palette token
    palette.fragment({ light: { primry: "red" }, dark: {} });
    // …nor when the values arrive through `both`.
    // @ts-expect-error — `radius` belongs to the shape group
    palette.fragment(both({ primary: "red", radius: "0" }));
  });
});
