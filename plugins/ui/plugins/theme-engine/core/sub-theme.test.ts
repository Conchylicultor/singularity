import { describe, it, expect } from "bun:test";

import { both, defineTokenGroup } from "./define-token-group";
import { defineSubTheme } from "./sub-theme";

const type = defineTokenGroup("type", {
  body: { default: "14px" },
  title: { default: "16px" },
});
const palette = defineTokenGroup("palette", {
  primary: { default: "blue", darkDefault: "navy" },
});

describe("defineSubTheme", () => {
  it("keeps the fragments as written and marks the result a sub-theme", () => {
    const sub = defineSubTheme({
      id: "reading",
      label: "Reading",
      fragments: [type.fragment(both({ body: "18px" }))],
    });
    expect(sub.kind).toBe("sub-theme");
    expect(sub.fragments).toEqual([
      { groupId: "type", light: { body: "18px" }, dark: { body: "18px" } },
    ]);
  });

  it("allows different values per mode, as long as both modes name the same tokens", () => {
    expect(() =>
      defineSubTheme({
        id: "tinted",
        label: "Tinted",
        fragments: [
          palette.fragment({
            light: { primary: "red" },
            dark: { primary: "maroon" },
          }),
        ],
      }),
    ).not.toThrow();
  });

  it("refuses a token set in one mode only, which would leak its light value onto a dark page", () => {
    expect(() =>
      defineSubTheme({
        id: "leaky",
        label: "Leaky",
        fragments: [palette.fragment({ light: { primary: "red" }, dark: {} })],
      }),
    ).toThrow(/names different tokens in light \(primary\) and dark \(\)/);
  });

  it("refuses an empty value — leaving the token out is how to keep the surrounding one", () => {
    expect(() =>
      defineSubTheme({
        id: "blank",
        label: "Blank",
        fragments: [type.fragment(both({ body: "" }))],
      }),
    ).toThrow(/token "body" of group "type" is empty/);
  });

  it("refuses two fragments for one group", () => {
    expect(() =>
      defineSubTheme({
        id: "twice",
        label: "Twice",
        fragments: [
          type.fragment(both({ body: "18px" })),
          type.fragment(both({ title: "30px" })),
        ],
      }),
    ).toThrow(/two fragments for token group "type"/);
  });

  it("refuses an id that cannot sit in a CSS selector and a style id", () => {
    expect(() =>
      defineSubTheme({ id: "Equin Doc", label: "x", fragments: [] }),
    ).toThrow(/must be kebab-case/);
    expect(() =>
      defineSubTheme({ id: "tweakcn:x", label: "x", fragments: [] }),
    ).toThrow(/must be kebab-case/);
  });
});
